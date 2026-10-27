import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, isExclusionViolation, withTransaction, type Db } from "../db";
import { getSettings } from "../settings";
import { findAvailableSlot } from "./availability";
import { notify } from "../email";

export class BookingError extends Error {
  constructor(
    public code: "slot_unavailable" | "not_found" | "invalid_state" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

export interface BookingDetails {
  id: string;
  reference: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  title: string | null;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: "confirmed" | "cancelled" | "completed";
  source: "public" | "admin";
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledBy: string | null;
}

export interface VisitorInput {
  name: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  notes?: string | null;
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newReference(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length];
  return `BTD-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const BOOKING_COLUMNS = `id, reference, visitor_name, visitor_email, visitor_phone, title, notes,
  starts_at, ends_at, status, source, created_at, cancelled_at, cancelled_by`;

function mapBooking(r: Record<string, unknown>): BookingDetails {
  return {
    id: r.id as string,
    reference: r.reference as string,
    visitorName: r.visitor_name as string,
    visitorEmail: r.visitor_email as string,
    visitorPhone: (r.visitor_phone as string) ?? null,
    title: (r.title as string) ?? null,
    notes: (r.notes as string) ?? null,
    startsAt: r.starts_at as Date,
    endsAt: r.ends_at as Date,
    status: r.status as BookingDetails["status"],
    source: r.source as BookingDetails["source"],
    createdAt: r.created_at as Date,
    cancelledAt: (r.cancelled_at as Date) ?? null,
    cancelledBy: (r.cancelled_by as string) ?? null,
  };
}

async function audit(db: Db, actor: string, action: string, bookingId: string | null, details: object = {}) {
  await db.query("insert into audit_log (actor, action, booking_id, details) values ($1, $2, $3, $4)", [
    actor,
    action,
    bookingId,
    JSON.stringify(details),
  ]);
}

async function insertBooking(
  client: PoolClient,
  v: VisitorInput,
  start: Date,
  end: Date,
  occupiedUntil: Date,
  source: "public" | "admin",
  tokenHash: string,
): Promise<BookingDetails> {
  try {
    await client.query("savepoint insert_booking");
    const { rows } = await client.query(
      `insert into bookings (reference, visitor_name, visitor_email, visitor_phone, title, notes,
                             starts_at, ends_at, occupied_until, source, manage_token_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning ${BOOKING_COLUMNS}`,
      [newReference(), v.name, v.email, v.phone || null, v.title || null, v.notes || null, start, end, occupiedUntil, source, tokenHash],
    );
    await client.query("release savepoint insert_booking");
    return mapBooking(rows[0]);
  } catch (err) {
    await client.query("rollback to savepoint insert_booking").catch(() => {});
    if (isExclusionViolation(err)) {
      throw new BookingError("slot_unavailable", "This time is no longer available.");
    }
    throw err;
  }
}

/**
 * Public booking: re-validates the requested time against the live schedule inside a
 * transaction. The settings row lock serialises concurrent requests, and the database
 * exclusion constraint is the final guarantee against overlaps.
 */
export async function createPublicBooking(
  start: Date,
  visitor: VisitorInput,
  opts: { now?: Date } = {},
): Promise<{ booking: BookingDetails; manageToken: string }> {
  const { token, hash } = newManageToken();
  const booking = await withTransaction(async (client) => {
    const settings = await getSettings(client, { forUpdate: true });
    const slot = await findAvailableSlot(client, settings, start, { now: opts.now });
    if (!slot) throw new BookingError("slot_unavailable", "This time is no longer available.");
    const occupiedUntil = new Date(slot.end.getTime() + settings.bufferMin * 60_000);
    const b = await insertBooking(client, visitor, slot.start, slot.end, occupiedUntil, "public", hash);
    await audit(client, "visitor", "booking.created", b.id);
    return b;
  });
  await notify({ type: "booking_created", booking, manageToken: token });
  return { booking, manageToken: token };
}

/**
 * Manual booking by Donald. By default the time must be a free slot in the schedule;
 * with `outsideSchedule` any time is accepted as long as it doesn't overlap another booking.
 */
export async function createAdminBooking(
  actor: string,
  start: Date,
  visitor: VisitorInput,
  opts: { durationMin?: number; outsideSchedule?: boolean; notifyVisitor?: boolean } = {},
): Promise<{ booking: BookingDetails; manageToken: string }> {
  const { token, hash } = newManageToken();
  const booking = await withTransaction(async (client) => {
    const settings = await getSettings(client, { forUpdate: true });
    const durationMin = opts.durationMin ?? settings.meetingDurationMin;
    const end = new Date(start.getTime() + durationMin * 60_000);
    if (start.getTime() < Date.now() - 60_000) {
      throw new BookingError("invalid_state", "The start time is in the past.");
    }
    if (!opts.outsideSchedule) {
      const slot = await findAvailableSlot(client, { ...settings, meetingDurationMin: durationMin }, start, {
        ignoreNoticeAndHorizon: true,
      });
      if (!slot) {
        throw new BookingError(
          "slot_unavailable",
          "That time isn't free in your schedule. Choose another time or allow times outside your normal hours.",
        );
      }
    }
    const occupiedUntil = new Date(end.getTime() + settings.bufferMin * 60_000);
    const b = await insertBooking(client, visitor, start, end, occupiedUntil, "admin", hash);
    await audit(client, actor, "booking.created", b.id, { outsideSchedule: !!opts.outsideSchedule });
    return b;
  });
  if (opts.notifyVisitor) await notify({ type: "booking_created", booking, manageToken: token });
  return { booking, manageToken: token };
}

export async function getBookingByToken(token: string): Promise<BookingDetails | null> {
  if (!token || token.length < 20) return null;
  const { rows } = await getPool().query(
    `select ${BOOKING_COLUMNS} from bookings where manage_token_hash = $1`,
    [hashToken(token)],
  );
  return rows[0] ? mapBooking(rows[0]) : null;
}

export async function getBookingById(id: string): Promise<BookingDetails | null> {
  const { rows } = await getPool().query(`select ${BOOKING_COLUMNS} from bookings where id = $1`, [id]);
  return rows[0] ? mapBooking(rows[0]) : null;
}

async function lockBooking(client: PoolClient, where: { id?: string; tokenHash?: string }) {
  const { rows } = where.id
    ? await client.query(`select ${BOOKING_COLUMNS} from bookings where id = $1 for update`, [where.id])
    : await client.query(`select ${BOOKING_COLUMNS} from bookings where manage_token_hash = $1 for update`, [
        where.tokenHash,
      ]);
  if (!rows[0]) throw new BookingError("not_found", "Booking not found.");
  return mapBooking(rows[0]);
}

export async function cancelBooking(
  target: { id?: string; token?: string },
  actor: { kind: "visitor" } | { kind: "admin"; label: string },
  opts: { notifyVisitor?: boolean } = {},
): Promise<BookingDetails> {
  const booking = await withTransaction(async (client) => {
    const existing = await lockBooking(client, {
      id: target.id,
      tokenHash: target.token ? hashToken(target.token) : undefined,
    });
    if (existing.status !== "confirmed") {
      throw new BookingError("invalid_state", "This booking is not active.");
    }
    if (actor.kind === "visitor" && existing.startsAt.getTime() <= Date.now()) {
      throw new BookingError("invalid_state", "This meeting has already started.");
    }
    const { rows } = await client.query(
      `update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, updated_at = now()
        where id = $1 returning ${BOOKING_COLUMNS}`,
      [existing.id, actor.kind],
    );
    await audit(client, actor.kind === "admin" ? actor.label : "visitor", "booking.cancelled", existing.id);
    return mapBooking(rows[0]);
  });
  await notify({
    type: "booking_cancelled",
    booking,
    by: actor.kind,
    notifyVisitor: actor.kind === "visitor" || !!opts.notifyVisitor,
  });
  return booking;
}

export async function rescheduleBooking(
  target: { id?: string; token?: string },
  newStart: Date,
  actor: { kind: "visitor" } | { kind: "admin"; label: string },
  opts: { outsideSchedule?: boolean; notifyVisitor?: boolean; now?: Date } = {},
): Promise<BookingDetails> {
  const { booking, previousStart } = await withTransaction(async (client) => {
    const settings = await getSettings(client, { forUpdate: true });
    const existing = await lockBooking(client, {
      id: target.id,
      tokenHash: target.token ? hashToken(target.token) : undefined,
    });
    if (existing.status !== "confirmed") {
      throw new BookingError("invalid_state", "Only active bookings can be rescheduled.");
    }
    if (actor.kind === "visitor" && existing.startsAt.getTime() <= Date.now()) {
      throw new BookingError("invalid_state", "This meeting has already started.");
    }
    const durationMin = Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000);
    const isAdmin = actor.kind === "admin";
    if (!(isAdmin && opts.outsideSchedule)) {
      const slot = await findAvailableSlot(client, { ...settings, meetingDurationMin: durationMin }, newStart, {
        excludeBookingId: existing.id,
        ignoreNoticeAndHorizon: isAdmin,
        now: opts.now,
      });
      if (!slot) throw new BookingError("slot_unavailable", "This time is no longer available.");
    } else if (newStart.getTime() < Date.now()) {
      throw new BookingError("invalid_state", "The new time is in the past.");
    }
    const end = new Date(newStart.getTime() + durationMin * 60_000);
    const occupiedUntil = new Date(end.getTime() + settings.bufferMin * 60_000);
    try {
      await client.query("savepoint resched");
      const { rows } = await client.query(
        `update bookings set starts_at = $2, ends_at = $3, occupied_until = $4, updated_at = now()
          where id = $1 returning ${BOOKING_COLUMNS}`,
        [existing.id, newStart, end, occupiedUntil],
      );
      await client.query("release savepoint resched");
      await audit(client, isAdmin ? actor.label : "visitor", "booking.rescheduled", existing.id, {
        from: existing.startsAt.toISOString(),
        to: newStart.toISOString(),
      });
      return { booking: mapBooking(rows[0]), previousStart: existing.startsAt };
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new BookingError("slot_unavailable", "This time is no longer available.");
      }
      throw err;
    }
  });
  await notify({
    type: "booking_rescheduled",
    booking,
    previousStart,
    by: actor.kind,
    notifyVisitor: actor.kind === "visitor" || !!opts.notifyVisitor,
  });
  return booking;
}

/** Past confirmed meetings become "completed" automatically. */
export async function markPastBookingsCompleted(db: Db = getPool()): Promise<void> {
  await db.query(
    "update bookings set status = 'completed', updated_at = now() where status = 'confirmed' and ends_at < now()",
  );
}

export interface BookingFilter {
  scope?: "upcoming" | "past" | "all";
  status?: "confirmed" | "cancelled" | "completed";
  q?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function listBookings(filter: BookingFilter): Promise<BookingDetails[]> {
  await markPastBookingsCompleted();
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filter.scope === "upcoming") where.push("ends_at >= now()");
  if (filter.scope === "past") where.push("ends_at < now()");
  if (filter.status) add("status = ?", filter.status);
  if (filter.from) add("ends_at > ?", filter.from);
  if (filter.to) add("starts_at < ?", filter.to);
  if (filter.q) {
    params.push(`%${filter.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(
      `(visitor_name ilike ${p} or visitor_email ilike ${p} or coalesce(visitor_phone,'') ilike ${p}
        or coalesce(title,'') ilike ${p} or reference ilike ${p})`,
    );
  }
  params.push(Math.min(filter.limit ?? 200, 500));
  const order = filter.scope === "past" ? "desc" : "asc";
  const { rows } = await getPool().query(
    `select ${BOOKING_COLUMNS} from bookings ${where.length ? "where " + where.join(" and ") : ""}
      order by starts_at ${order} limit $${params.length}`,
    params,
  );
  return rows.map(mapBooking);
}

export async function updateBookingDetails(
  actor: string,
  id: string,
  fields: Partial<VisitorInput>,
): Promise<BookingDetails> {
  const { rows } = await getPool().query(
    `update bookings set
        visitor_name = coalesce($2, visitor_name),
        visitor_email = coalesce($3, visitor_email),
        visitor_phone = case when $4::boolean then $5 else visitor_phone end,
        title = case when $6::boolean then $7 else title end,
        notes = case when $8::boolean then $9 else notes end,
        updated_at = now()
      where id = $1 returning ${BOOKING_COLUMNS}`,
    [
      id,
      fields.name ?? null,
      fields.email ?? null,
      fields.phone !== undefined,
      fields.phone || null,
      fields.title !== undefined,
      fields.title || null,
      fields.notes !== undefined,
      fields.notes || null,
    ],
  );
  if (!rows[0]) throw new BookingError("not_found", "Booking not found.");
  await audit(getPool(), actor, "booking.updated", id);
  return mapBooking(rows[0]);
}

/** Permanently removes a booking's personal data (only for bookings that are not upcoming). */
export async function deleteBooking(actor: string, id: string): Promise<void> {
  await withTransaction(async (client) => {
    const existing = await lockBooking(client, { id });
    if (existing.status === "confirmed" && existing.endsAt.getTime() > Date.now()) {
      throw new BookingError("invalid_state", "Cancel the booking before deleting it.");
    }
    await client.query("delete from bookings where id = $1", [id]);
    await audit(client, actor, "booking.deleted", null, { reference: existing.reference });
  });
}
