import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { pgConfig } from "../src/lib/dbconfig";

async function main() {
  if (!process.env.DATABASE_URL) {
    // Lets `npm run build` work without a database (e.g. a quick local build).
    console.log("DATABASE_URL is not set; skipping migrations.");
    return;
  }
  const client = new Client(pgConfig());
  await client.connect();
  // Two deployments building at once must not apply the same migration twice.
  await client.query("select pg_advisory_lock(727274)");
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`Applying ${file}... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log("done");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
  await client.end();
  console.log("Database is up to date.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
