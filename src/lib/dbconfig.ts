import type { PoolConfig } from "pg";

/**
 * Connection settings shared by the app and the scripts. SSL is switched on automatically
 * for hosted databases (anything that isn't localhost), unless DATABASE_SSL=false.
 * Any sslmode in the URL is dropped so it can't override these SSL settings.
 */
export function pgConfig(connectionString = process.env.DATABASE_URL): PoolConfig {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const flag = process.env.DATABASE_SSL;
  const ssl = flag === "true" || (flag !== "false" && !local);
  return { connectionString: url.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined };
}
