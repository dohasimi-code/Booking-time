// End-to-end tests against a running server that uses the test database:
//   DATABASE_URL=<test db> npm run build && DATABASE_URL=<test db> npx next start -p 3100
//   E2E_BASE_URL=http://localhost:3100 npm test -- tests/e2e
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db";
import { at, nextWeekday, resetDb, visitor } from "../integration/helpers";

const BASE = process.env.E2E_BASE_URL;
const ADMIN = { email: "donald@example.com", password: "a-long-test-password" };
const monday = nextWeekday(1);

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE!, ...headers },
    body: JSON.stringify(body),
  });
}

async function login(): Promise<string> {
  const res = await post("/api/admin/login", ADMIN);
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!;
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  return cookie.split(";")[0];
}

async function book(time: string, n = 1) {
  return post("/api/public/bookings", { ...visitor(n), start: at(monday, time).toISOString() });
}

describe.skipIf(!BASE)("end to end", () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await resetDb();
    await getPool().query("insert into admin_users (email, name, password_hash) values ($1, 'Donald', $2)", [
      ADMIN.email,
      await bcrypt.hash(ADMIN.password, 4),
    ]);
  });
  afterAll(() => getPool().end());

  describe("public API privacy", () => {
    it("returns only times and statuses, never personal details or block reasons", async () => {
      expect((await book("09:00", 3)).status).toBe(201);
      const login1 = await login();
      const blockRes = await post(
        "/api/admin/blocks",
        { start: at(monday, "13:00").toISOString(), end: at(monday, "14:00").toISOString(), reason: "Doctor visit" },
        { Cookie: login1 },
      );
      expect(blockRes.status).toBe(201);

      const res = await fetch(`${BASE}/api/public/availability?from=${monday}&to=${monday}`);
      const text = await res.text();
      const v = visitor(3);
      for (const secret of [v.name, v.email, v.phone, v.title, v.notes, "Doctor visit", "BTD-", "reference", "visitor"]) {
        expect(text).not.toContain(secret);
      }
      const data = JSON.parse(text);
      const slots = data.days[0].slots;
      for (const s of slots) expect(Object.keys(s).sort()).toEqual(["end", "start", "status"]);
      const byStart = Object.fromEntries(slots.map((s: { start: string; status: string }) => [s.start, s.status]));
      expect(byStart[at(monday, "09:00").toISOString()]).toBe("booked");
      expect(byStart[at(monday, "13:00").toISOString()]).toBe("blocked");
    });

    it("returns only the visitor's own booking after booking", async () => {
      const res = await book("09:00");
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(["end", "manageToken", "name", "reference", "start", "title"]);
    });
  });

  describe("public booking validation", () => {
    it("rejects missing required information", async () => {
      const res = await post("/api/public/bookings", { email: "a@example.com", start: at(monday, "09:00").toISOString() });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_input");
    });

    it("rejects an invalid email", async () => {
      const res = await post("/api/public/bookings", { name: "Ana Hoxha", email: "not-an-email", start: at(monday, "09:00").toISOString() });
      expect(res.status).toBe(400);
      expect((await res.json()).message).toMatch(/valid email/);
    });

    it("rejects unavailable and out-of-schedule times", async () => {
      expect((await book("09:00", 1)).status).toBe(201);
      expect((await book("09:00", 2)).status).toBe(409);
      expect((await book("16:00", 2)).status).toBe(409);
    });

    it("lets exactly one of many simultaneous requests win", async () => {
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => book("10:00", i)));
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(9);
    });

    it("ignores bots that fill the hidden field", async () => {
      const res = await post("/api/public/bookings", { ...visitor(), website: "spam", start: at(monday, "09:00").toISOString() });
      expect(res.status).toBe(400);
    });
  });

  describe("visitor booking management", () => {
    it("cancels with the private link and frees the slot", async () => {
      const { manageToken } = await (await book("11:00")).json();
      const cancel = await post(`/api/public/manage/${manageToken}`, { action: "cancel" });
      expect(cancel.status).toBe(200);
      expect((await cancel.json()).status).toBe("cancelled");
      expect((await book("11:00", 2)).status).toBe(201);
    });

    it("does not accept booking IDs or references in place of the private token", async () => {
      const { reference } = await (await book("11:00")).json();
      const { rows } = await getPool().query("select id from bookings where reference = $1", [reference]);
      for (const guess of [rows[0].id, reference, "a".repeat(43)]) {
        expect((await fetch(`${BASE}/api/public/manage/${guess}`)).status).toBe(404);
        expect((await post(`/api/public/manage/${guess}`, { action: "cancel" })).status).toBe(404);
      }
      const { rows: still } = await getPool().query("select status from bookings where reference = $1", [reference]);
      expect(still[0].status).toBe("confirmed");
    });
  });

  describe("admin security", () => {
    const adminEndpoints = ["/api/admin/bookings", "/api/admin/blocks", "/api/admin/schedule", "/api/admin/settings"];

    it("requires sign-in for every admin endpoint", async () => {
      for (const p of adminEndpoints) {
        expect((await fetch(`${BASE}${p}`)).status).toBe(401);
        expect((await fetch(`${BASE}${p}`, { headers: { Cookie: "btd_admin=forged-token-value" } })).status).toBe(401);
      }
      expect((await post("/api/admin/blocks", { start: at(monday, "09:00"), end: at(monday, "10:00") })).status).toBe(401);
    });

    it("sends visitors to the sign-in page instead of the dashboard", async () => {
      for (const p of ["/admin", "/admin/blocks", "/admin/settings"]) {
        const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
        expect([307, 308]).toContain(res.status);
        expect(res.headers.get("location")).toContain("/admin/login");
      }
      const forged = await fetch(`${BASE}/admin`, { redirect: "manual", headers: { Cookie: "btd_admin=forged" } });
      expect(forged.headers.get("location")).toContain("/admin/login");
    });

    it("rejects wrong passwords", async () => {
      const res = await post("/api/admin/login", { email: ADMIN.email, password: "wrong-password" });
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("gives Donald full booking details once signed in", async () => {
      await book("09:00", 5);
      const cookie = await login();
      const res = await fetch(`${BASE}/api/admin/bookings?scope=upcoming`, { headers: { Cookie: cookie } });
      const { bookings } = await res.json();
      expect(bookings[0]).toMatchObject({ visitorName: visitor(5).name, visitorEmail: visitor(5).email, notes: visitor(5).notes });
    });

    it("blocks cross-site requests that carry Donald's cookie", async () => {
      const cookie = await login();
      const res = await post(
        "/api/admin/blocks",
        { start: at(monday, "09:00").toISOString(), end: at(monday, "10:00").toISOString() },
        { Cookie: cookie, Origin: "https://evil.example" },
      );
      expect(res.status).toBe(403);
    });

    it("signs out and invalidates the session", async () => {
      const cookie = await login();
      await post("/api/admin/logout", {}, { Cookie: cookie });
      expect((await fetch(`${BASE}/api/admin/bookings`, { headers: { Cookie: cookie } })).status).toBe(401);
    });

    it("sends security headers", async () => {
      const res = await fetch(`${BASE}/book/donald`);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe("same-origin");
    });
  });
});
