// Creates or updates Donald's admin login. The password is read from the
// ADMIN_PASSWORD environment variable or typed interactively; it is never stored in code.
//   ADMIN_EMAIL=donald@example.com ADMIN_NAME=Donald npm run admin:create
import { createInterface } from "node:readline/promises";
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || (await prompt("Admin email: "))).toLowerCase();
  const name = process.env.ADMIN_NAME || "Donald";
  const password = process.env.ADMIN_PASSWORD || (await prompt("Admin password (min 12 characters): "));
  if (!email.includes("@")) throw new Error("A valid email is required");
  if (password.length < 12) throw new Error("Password must be at least 12 characters");

  const hash = await bcrypt.hash(password, 12);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  await client.query(
    `insert into admin_users (email, name, password_hash) values ($1, $2, $3)
     on conflict (email) do update set name = excluded.name, password_hash = excluded.password_hash`,
    [email, name, hash],
  );
  // Log out existing sessions whenever the password changes.
  await client.query(
    "delete from admin_sessions where admin_id = (select id from admin_users where email = $1)",
    [email],
  );
  await client.query("update settings set owner_email = coalesce(owner_email, $1)", [email]);
  await client.end();
  console.log(`Admin login ready for ${email}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
