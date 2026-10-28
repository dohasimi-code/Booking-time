import { afterEach, describe, expect, it } from "vitest";
import { databaseUrl, pgConfig } from "@/lib/dbconfig";

afterEach(() => {
  delete process.env.DATABASE_SSL;
});

describe("database connection settings", () => {
  it("uses SSL for hosted databases and drops sslmode from the URL", () => {
    const c = pgConfig("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
  });

  it("accepts the POSTGRES_URL set by the Supabase integration for Vercel", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgres://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
    expect(databaseUrl()).toBe(process.env.POSTGRES_URL);
    expect(pgConfig().connectionString).not.toMatch(/sslmode|supa=/);
    delete process.env.POSTGRES_URL;
    process.env.DATABASE_URL = saved;
  });

  it("skips SSL for a local database", () => {
    expect(pgConfig("postgres://booking:booking@localhost:5432/booking").ssl).toBeUndefined();
  });

  it("respects an explicit DATABASE_SSL setting", () => {
    process.env.DATABASE_SSL = "false";
    expect(pgConfig("postgres://u:p@db.example.com/x").ssl).toBeUndefined();
    process.env.DATABASE_SSL = "true";
    expect(pgConfig("postgres://u:p@localhost/x").ssl).toBeTruthy();
  });
});
