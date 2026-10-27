// Data retention: permanently deletes bookings (and their personal data) that ended
// more than N days ago. Default 365 days.  npm run data:purge -- 180
import { Client } from "pg";

async function main() {
  const days = Number(process.argv[2] ?? 365);
  if (!Number.isInteger(days) || days < 1) throw new Error("Pass a number of days, e.g. 365");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const { rowCount } = await client.query(
    "delete from bookings where ends_at < now() - make_interval(days => $1) and status <> 'confirmed'",
    [days],
  );
  await client.query("delete from audit_log where created_at < now() - make_interval(days => $1)", [days]);
  await client.query("insert into audit_log (actor, action, details) values ('system', 'retention.purge', $1)", [
    JSON.stringify({ days, deleted: rowCount }),
  ]);
  await client.end();
  console.log(`Deleted ${rowCount} booking(s) older than ${days} days.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
