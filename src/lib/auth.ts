import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getPool } from "./db";
import { hashToken } from "./services/bookings";

export const SESSION_COOKIE = "btd_admin";
const SESSION_HOURS = 24 * 7;
// A real bcrypt hash used to keep timing the same when the email is unknown.
const DUMMY_HASH = "$2b$12$1QQfdHroWZ7BxpL.qsU0we79xoJC7wAxNQzgENsr0WcctSXcSPC.6";

export interface Admin {
  id: string;
  email: string;
  name: string;
}

export async function verifyCredentials(email: string, password: string): Promise<Admin | null> {
  const { rows } = await getPool().query(
    "select id, email, name, password_hash from admin_users where email = $1",
    [email.trim().toLowerCase()],
  );
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  return row && ok ? { id: row.id, email: row.email, name: row.name } : null;
}

export async function createSession(adminId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await getPool().query("delete from admin_sessions where expires_at < now()");
  await getPool().query("insert into admin_sessions (token_hash, admin_id, expires_at) values ($1, $2, $3)", [
    hashToken(token),
    adminId,
    expires,
  ]);
  return { token, expires };
}

export async function adminFromToken(token: string | undefined): Promise<Admin | null> {
  if (!token) return null;
  const { rows } = await getPool().query(
    `select a.id, a.email, a.name from admin_sessions s join admin_users a on a.id = s.admin_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/** The signed-in admin for the current request, or null. */
export async function currentAdmin(): Promise<Admin | null> {
  const store = await cookies();
  return adminFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (token) await getPool().query("delete from admin_sessions where token_hash = $1", [hashToken(token)]);
}

export async function adminExists(): Promise<boolean> {
  const { rows } = await getPool().query("select exists (select 1 from admin_users) as e");
  return rows[0].e;
}

/** Setup is possible only while no admin exists and ADMIN_SETUP_CODE is configured. */
export function setupCodeConfigured(): boolean {
  return (process.env.ADMIN_SETUP_CODE ?? "").trim().length >= 8;
}

export function setupCodeMatches(code: string): boolean {
  const expected = createHash("sha256").update((process.env.ADMIN_SETUP_CODE ?? "").trim()).digest();
  const given = createHash("sha256").update(code.trim()).digest();
  return setupCodeConfigured() && timingSafeEqual(expected, given);
}

/** Creates the first admin. Returns null if an admin already exists. */
export async function createFirstAdmin(name: string, email: string, password: string): Promise<Admin | null> {
  const hash = await bcrypt.hash(password, 12);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("lock table admin_users in exclusive mode");
    const { rows: existing } = await client.query("select 1 from admin_users limit 1");
    if (existing.length) {
      await client.query("rollback");
      return null;
    }
    const { rows } = await client.query(
      "insert into admin_users (email, name, password_hash) values ($1, $2, $3) returning id, email, name",
      [email, name, hash],
    );
    await client.query("update settings set owner_email = coalesce(owner_email, $1)", [email]);
    await client.query("insert into audit_log (actor, action) values ($1, 'admin.setup')", [`admin:${email}`]);
    await client.query("commit");
    return rows[0];
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
