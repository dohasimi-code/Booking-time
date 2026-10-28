// Drives the real UI in Chromium. Needs E2E_BASE_URL (see app.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { chromium, type Browser } from "playwright";
import { DateTime } from "luxon";
import { getPool } from "@/lib/db";
import { resetDb, TZ } from "../integration/helpers";

const BASE = process.env.E2E_BASE_URL;
const SHOTS = process.env.E2E_SCREENSHOTS;

describe.skipIf(!BASE)("browser", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  beforeEach(async () => {
    await resetDb({ minNoticeMin: 0 });
    await getPool().query("insert into admin_users (email, name, password_hash) values ('donald@example.com', 'Donald', $1)", [
      await bcrypt.hash("a-long-test-password", 4),
    ]);
  });
  afterAll(async () => {
    await browser?.close();
    await getPool().end();
  });

  it("lets a visitor book on a phone, then Donald sees and cancels it", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "America/New_York" });
    await page.goto(`${BASE}/book/donald`);
    await page.getByRole("heading", { name: "Booking Time with Donald" }).waitFor();

    // Pick the next date that has free times, then its first free time.
    const next = page.getByRole("button", { name: "Next month" });
    await page.locator("section[aria-labelledby=pick-time] button").first().waitFor();
    const firstSlot = page.locator("section[aria-labelledby=pick-time] button").first();
    const slotTime = (await firstSlot.textContent())!.trim();
    void next;
    await firstSlot.click();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-pick.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();

    // Required fields are enforced.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please enter your full name.")).toBeTruthy();
    await page.getByLabel("Full name").fill("Arta Krasniqi");
    await page.getByLabel("Email address").fill("arta@example.com");
    await page.getByLabel("Meeting title or purpose").fill("Partnership chat");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-details.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("Check your booking").waitFor();
    expect(await page.getByText(/Your local time/).count()).toBe(1); // viewer is in New York
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-review.png`, fullPage: true });
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await page.getByText("You're booked!").waitFor();
    const reference = (await page.locator("dd.font-medium span.font-mono").textContent())!;
    expect(reference).toMatch(/^BTD-/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-done.png`, fullPage: true });

    const { rows } = await getPool().query("select starts_at from bookings where reference = $1", [reference]);
    expect(DateTime.fromJSDate(rows[0].starts_at, { zone: TZ }).toFormat("HH:mm")).toBe(slotTime);

    // The slot now shows as booked for the next visitor.
    const other = await browser.newPage();
    await other.goto(`${BASE}/book/donald`);
    await other.locator("section[aria-labelledby=pick-time] [aria-disabled=true]").first().waitFor();
    expect(await other.locator("section[aria-labelledby=pick-time] [aria-disabled=true]").first().textContent()).toContain("Booked");
    if (SHOTS) await other.screenshot({ path: `${SHOTS}/5-booked-desktop.png`, fullPage: true });

    // Donald signs in and cancels.
    const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await admin.goto(`${BASE}/admin`);
    await admin.waitForURL(/\/admin\/login/);
    await admin.getByLabel("Email").fill("donald@example.com");
    await admin.getByLabel("Password").fill("a-long-test-password");
    await admin.getByRole("button", { name: "Sign in" }).click();
    await admin.getByRole("heading", { name: "Bookings" }).waitFor();
    await admin.getByText("Arta Krasniqi").click();
    await admin.getByText("arta@example.com").first().waitFor();
    if (SHOTS) await admin.screenshot({ path: `${SHOTS}/6-admin-detail.png`, fullPage: true });
    await admin.getByRole("button", { name: "Cancel booking" }).click();
    await admin.getByRole("button", { name: "Yes, cancel booking" }).click();
    await admin.getByRole("dialog").getByText("cancelled", { exact: true }).waitFor();

    const { rows: after } = await getPool().query("select status from bookings where reference = $1", [reference]);
    expect(after[0].status).toBe("cancelled");
  }, 60_000);

  it("warns Donald before blocking time that has a booking", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const day = DateTime.now().setZone(TZ).plus({ days: 3 });
    const start = day.set({ hour: 17, minute: 0, second: 0, millisecond: 0 });
    await getPool().query(
      `insert into bookings (reference, visitor_name, visitor_email, starts_at, ends_at, occupied_until)
       values ('BTD-TEST-0001', 'Besa Gashi', 'besa@example.com', $1, $2, $2)`,
      [start.toJSDate(), start.plus({ minutes: 30 }).toJSDate()],
    );
    await page.goto(`${BASE}/admin/login`);
    await page.getByLabel("Email").fill("donald@example.com");
    await page.getByLabel("Password").fill("a-long-test-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("heading", { name: "Bookings" }).waitFor();
    await page.goto(`${BASE}/admin/blocks`);
    await page.getByRole("button", { name: "+ Block time" }).click();
    await page.getByLabel("Whole day(s)").check();
    await page.getByLabel("From date").fill(day.toISODate()!);
    await page.getByLabel("To date").fill(day.toISODate()!);
    await page.getByLabel(/Private reason/).fill("Family day");
    await page.getByRole("button", { name: "Save blocked time" }).click();
    await page.getByText("This time has bookings").waitFor();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/7-block-conflict.png`, fullPage: true });
    await page.getByRole("button", { name: "Block the time but keep these bookings" }).click();
    await page.getByText(/existing booking\(s\) kept/).waitFor();
    const { rows } = await getPool().query("select status from bookings where reference = 'BTD-TEST-0001'");
    expect(rows[0].status).toBe("confirmed");

    // Visitors see the day as unavailable, without the reason.
    const visitor = await browser.newPage();
    const res = await visitor.request.get(`${BASE}/api/public/availability?from=${day.toISODate()}&to=${day.toISODate()}`);
    expect(await res.text()).not.toContain("Family day");
    if (SHOTS) {
      await page.goto(`${BASE}/admin/calendar`);
      await page.getByText("Besa Gashi").first().waitFor();
      await page.screenshot({ path: `${SHOTS}/8-admin-calendar.png`, fullPage: true });
      for (const p of ["availability", "settings"]) {
        await page.goto(`${BASE}/admin/${p}`);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${SHOTS}/9-admin-${p}.png`, fullPage: true });
      }
    }
  }, 60_000);
});
