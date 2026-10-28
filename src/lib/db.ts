import { Pool, type PoolClient } from "pg";
import { pgConfig } from "./dbconfig";

// Server-only database access. Never import this from a client component.
const globalForDb = globalThis as unknown as { __bookingPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__bookingPool) {
    globalForDb.__bookingPool = new Pool({ ...pgConfig(), max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  }
  return globalForDb.__bookingPool;
}

export type Db = Pool | PoolClient;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function isExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23P01";
}
