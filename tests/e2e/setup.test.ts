// First-run setup of Donald's login. Server must run with ADMIN_SETUP_CODE=test-setup-code-123.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { resetDb } from "../integration/helpers";

const BASE = process.env.E2E_BASE_URL;
const CODE = "test-setup-code-123";
const body = (code: string) => ({ code, name: "Donald", email: "donald@example.com", password: "a-long-test-password" });
const post = (b: unknown) =>
  fetch(`${BASE}/api/admin/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE! }, body: JSON.stringify(b) });

describe.skipIf(!BASE)("first-run setup", () => {
  beforeEach(() => resetDb());
  afterAll(() => getPool().end());

  it("sends Donald to setup while no login exists", async () => {
    const res = await fetch(`${BASE}/admin/login`, { redirect: "manual" });
    expect(res.headers.get("location")).toContain("/admin/setup");
  });

  it("refuses a wrong setup code", async () => {
    expect((await post(body("wrong-code-000"))).status).toBe(401);
    const { rows } = await getPool().query("select count(*)::int n from admin_users");
    expect(rows[0].n).toBe(0);
  });

  it("creates the login once with the right code, then switches itself off", async () => {
    const res = await post(body(CODE));
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect((await fetch(`${BASE}/api/admin/bookings`, { headers: { Cookie: cookie } })).status).toBe(200);

    const again = await post({ ...body(CODE), email: "intruder@example.com" });
    expect(again.status).toBe(409);
    const { rows } = await getPool().query("select email from admin_users");
    expect(rows.map((r) => r.email)).toEqual(["donald@example.com"]);
    const page = await fetch(`${BASE}/admin/setup`, { redirect: "manual" });
    expect(page.headers.get("location")).toContain("/admin/login");
  });

  it("only lets the login be created by simultaneous requests once", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => post({ ...body(CODE), email: `donald${i}@example.com` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const { rows } = await getPool().query("select count(*)::int n from admin_users");
    expect(rows[0].n).toBe(1);
  });

  it("rejects cross-site setup requests", async () => {
    const res = await fetch(`${BASE}/api/admin/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify(body(CODE)),
    });
    expect(res.status).toBe(403);
  });
});
