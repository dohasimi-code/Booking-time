import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { getAvailability } from "@/lib/services/availability";
import {
  BookingError,
  cancelBooking,
  createAdminBooking,
  createPublicBooking,
  getBookingByToken,
  rescheduleBooking,
} from "@/lib/services/bookings";
import { BlockConflictError, saveBlock } from "@/lib/services/blocks";
import { at, nextWeekday, resetDb, visitor } from "./helpers";

const monday = nextWeekday(1);

async function slotStatus(date: string, time: string) {
  const { days } = await getAvailability(getPool(), date, date);
  return days[0]?.slots.find((s) => s.start.getTime() === at(date, time).getTime())?.status ?? "missing";
}

async function expectBookingError(p: Promise<unknown>, code: BookingError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof BookingError && e.code === code);
}

beforeEach(() => resetDb());
afterAll(() => getPool().end());

describe("public booking", () => {
  it("creates a booking and marks the slot as booked", async () => {
    const { booking, manageToken } = await createPublicBooking(at(monday, "09:00"), visitor());
    expect(booking.status).toBe("confirmed");
    expect(booking.reference).toMatch(/^BTD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(booking.endsAt.getTime() - booking.startsAt.getTime()).toBe(30 * 60_000);
    expect(manageToken.length).toBeGreaterThanOrEqual(40);
    expect(await slotStatus(monday, "09:00")).toBe("booked");
    expect(await slotStatus(monday, "09:30")).toBe("available");

    // Only a hash of the management token is stored.
    const { rows } = await getPool().query("select manage_token_hash from bookings where id = $1", [booking.id]);
    expect(rows[0].manage_token_hash).not.toBe(manageToken);
  });

  it("rejects a slot that is already booked", async () => {
    await createPublicBooking(at(monday, "09:00"), visitor(1));
    await expectBookingError(createPublicBooking(at(monday, "09:00"), visitor(2)), "slot_unavailable");
  });

  it("rejects times outside the schedule or not on a slot boundary", async () => {
    await expectBookingError(createPublicBooking(at(monday, "16:00"), visitor()), "slot_unavailable");
    await expectBookingError(createPublicBooking(at(monday, "15:45"), visitor()), "slot_unavailable");
    await expectBookingError(createPublicBooking(at(monday, "09:10"), visitor()), "slot_unavailable");
    await expectBookingError(createPublicBooking(at(monday, "07:30"), visitor()), "slot_unavailable");
  });

  it("rejects times beyond the booking horizon", async () => {
    await resetDb({ maxHorizonDays: 7 });
    const far = nextWeekday(6, 20);
    await expectBookingError(createPublicBooking(at(far, "10:00"), visitor()), "slot_unavailable");
  });

  it("rejects blocked times", async () => {
    await saveBlock("admin:test", { start: at(monday, "10:00"), end: at(monday, "11:30"), reason: "Dentist" });
    await expectBookingError(createPublicBooking(at(monday, "10:30"), visitor()), "slot_unavailable");
    expect(await slotStatus(monday, "10:30")).toBe("blocked");
  });

  it("lets exactly one of many simultaneous visitors book the same slot", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => createPublicBooking(at(monday, "11:00"), visitor(i))),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(11);
    for (const f of failed) expect((f.reason as BookingError).code).toBe("slot_unavailable");
    const { rows } = await getPool().query("select count(*)::int as n from bookings where status = 'confirmed'");
    expect(rows[0].n).toBe(1);
  });

  it("enforces buffer time between bookings", async () => {
    await resetDb({ bufferMin: 15 });
    await createPublicBooking(at(monday, "09:00"), visitor(1));
    await expectBookingError(createPublicBooking(at(monday, "09:30"), visitor(2)), "slot_unavailable");
    await expectBookingError(createPublicBooking(at(monday, "08:30"), visitor(3)), "slot_unavailable");
    await createPublicBooking(at(monday, "10:00"), visitor(4));
  });
});

describe("database guarantee", () => {
  it("refuses overlapping confirmed bookings even if the app logic is bypassed", async () => {
    const insert = (ref: string, start: string, end: string) =>
      getPool().query(
        `insert into bookings (reference, visitor_name, visitor_email, starts_at, ends_at, occupied_until)
         values ($1, 'A', 'a@example.com', $2, $3, $3)`,
        [ref, at(monday, start), at(monday, end)],
      );
    await insert("R1", "09:00", "10:00");
    await expect(insert("R2", "09:30", "10:30")).rejects.toMatchObject({ code: "23P01" });
    await insert("R3", "10:00", "10:30"); // touching is fine
  });
});

describe("cancel and reschedule", () => {
  it("frees the slot after a visitor cancels with their link", async () => {
    const { manageToken } = await createPublicBooking(at(monday, "09:00"), visitor());
    await cancelBooking({ token: manageToken }, { kind: "visitor" });
    expect((await getBookingByToken(manageToken))?.status).toBe("cancelled");
    expect(await slotStatus(monday, "09:00")).toBe("available");
    await createPublicBooking(at(monday, "09:00"), visitor(2));
  });

  it("does not let anyone act on a booking without its token", async () => {
    const { booking } = await createPublicBooking(at(monday, "09:00"), visitor());
    expect(await getBookingByToken(booking.id)).toBeNull();
    expect(await getBookingByToken(booking.reference)).toBeNull();
    expect(await getBookingByToken("x".repeat(43))).toBeNull();
    await expectBookingError(cancelBooking({ token: "x".repeat(43) }, { kind: "visitor" }), "not_found");
  });

  it("reschedules to a free slot and releases the old one", async () => {
    const { manageToken } = await createPublicBooking(at(monday, "09:00"), visitor());
    const moved = await rescheduleBooking({ token: manageToken }, at(monday, "13:00"), { kind: "visitor" });
    expect(moved.startsAt.getTime()).toBe(at(monday, "13:00").getTime());
    expect(await slotStatus(monday, "09:00")).toBe("available");
    expect(await slotStatus(monday, "13:00")).toBe("booked");
  });

  it("allows rescheduling into an adjacent slot that overlaps only itself", async () => {
    await resetDb({ meetingDurationMin: 60, slotIntervalMin: 30 });
    const { manageToken } = await createPublicBooking(at(monday, "09:00"), visitor());
    await rescheduleBooking({ token: manageToken }, at(monday, "09:30"), { kind: "visitor" });
  });

  it("refuses to reschedule into a taken slot and keeps the original time", async () => {
    const a = await createPublicBooking(at(monday, "09:00"), visitor(1));
    await createPublicBooking(at(monday, "10:00"), visitor(2));
    await expectBookingError(
      rescheduleBooking({ token: a.manageToken }, at(monday, "10:00"), { kind: "visitor" }),
      "slot_unavailable",
    );
    expect((await getBookingByToken(a.manageToken))?.startsAt.getTime()).toBe(at(monday, "09:00").getTime());
  });

  it("refuses to cancel twice", async () => {
    const { manageToken } = await createPublicBooking(at(monday, "09:00"), visitor());
    await cancelBooking({ token: manageToken }, { kind: "visitor" });
    await expectBookingError(cancelBooking({ token: manageToken }, { kind: "visitor" }), "invalid_state");
  });
});

describe("admin bookings and blocking", () => {
  it("lets Donald book outside normal hours but never on top of another booking", async () => {
    await expectBookingError(createAdminBooking("admin:test", at(monday, "16:15"), visitor()), "slot_unavailable");
    await createAdminBooking("admin:test", at(monday, "16:15"), visitor(1), { outsideSchedule: true });
    await expectBookingError(
      createAdminBooking("admin:test", at(monday, "16:30"), visitor(2), { outsideSchedule: true }),
      "slot_unavailable",
    );
  });

  it("warns about conflicts and never cancels appointments silently", async () => {
    const { booking } = await createPublicBooking(at(monday, "10:00"), visitor());
    const block = { start: at(monday, "09:00"), end: at(monday, "12:00"), reason: "Busy" };

    await expect(saveBlock("admin:test", block)).rejects.toBeInstanceOf(BlockConflictError);
    const { rows: none } = await getPool().query("select count(*)::int n from blocked_periods");
    expect(none[0].n).toBe(0);

    const kept = await saveBlock("admin:test", block, "keep");
    expect(kept.kept.map((c) => c.id)).toEqual([booking.id]);
    const { rows } = await getPool().query("select status from bookings where id = $1", [booking.id]);
    expect(rows[0].status).toBe("confirmed");
  });

  it("cancels conflicting appointments only when explicitly asked", async () => {
    const { booking } = await createPublicBooking(at(monday, "10:00"), visitor());
    const result = await saveBlock(
      "admin:test",
      { start: at(monday, "09:00"), end: at(monday, "12:00"), reason: "Busy" },
      "cancel",
    );
    expect(result.cancelled.map((b) => b.id)).toEqual([booking.id]);
    expect(await slotStatus(monday, "10:00")).toBe("blocked");
  });

  it("supports whole-day and multi-day blocks", async () => {
    const tue = nextWeekday(2);
    const thu = nextWeekday(4, 4);
    await saveBlock("admin:test", { start: at(tue, "00:00"), end: at(thu, "23:59") });
    const { days } = await getAvailability(getPool(), tue, thu);
    for (const d of days) {
      expect(d.slots.length).toBeGreaterThan(0);
      expect(d.slots.every((s) => s.status === "blocked")).toBe(true);
    }
  });

  it("keeps an audit trail of changes", async () => {
    const { booking } = await createAdminBooking("admin:donald@example.com", at(monday, "09:00"), visitor());
    await rescheduleBooking({ id: booking.id }, at(monday, "14:00"), { kind: "admin", label: "admin:donald@example.com" });
    await cancelBooking({ id: booking.id }, { kind: "admin", label: "admin:donald@example.com" });
    const { rows } = await getPool().query("select action from audit_log where booking_id = $1 order by id", [
      booking.id,
    ]);
    expect(rows.map((r) => r.action)).toEqual(["booking.created", "booking.rescheduled", "booking.cancelled"]);
  });
});

describe("privacy", () => {
  it("availability data contains no personal details or block reasons", async () => {
    const v = visitor(7);
    await createPublicBooking(at(monday, "09:00"), v);
    await saveBlock("admin:test", { start: at(monday, "14:00"), end: at(monday, "15:00"), reason: "Doctor visit" });
    const result = await getAvailability(getPool(), monday, monday);
    const serialized = JSON.stringify(result.days);
    for (const secret of [v.name, v.email, v.phone, v.title, v.notes, "Doctor visit", "BTD-"]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
