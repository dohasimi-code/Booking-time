import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  mergeRanges,
  slotsForDate,
  type AvailabilityInput,
  type SchedulingSettings,
  type WeeklyWindow,
} from "@/lib/availability";

const TZ = "Europe/Tirane";

// The default weekly schedule from the brief.
const DEFAULT_RULES: WeeklyWindow[] = [
  ...[1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 480, endMinute: 960 })),
  ...[1, 2, 3, 4, 5, 6, 7].map((d) => ({ dayOfWeek: d, startMinute: 1020, endMinute: 1440 })),
  ...[6, 7].map((d) => ({ dayOfWeek: d, startMinute: 0, endMinute: 1440 })),
];

const baseSettings: SchedulingSettings = {
  timezone: TZ,
  meetingDurationMin: 30,
  slotIntervalMin: 30,
  bufferMin: 0,
  minNoticeMin: 0,
  maxHorizonDays: 365,
};

const local = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const hhmm = (d: Date) => DateTime.fromJSDate(d, { zone: TZ }).toFormat("HH:mm");

function input(overrides: Omit<Partial<AvailabilityInput>, "settings"> & { settings?: Partial<SchedulingSettings> } = {}): AvailabilityInput {
  return {
    rules: DEFAULT_RULES,
    recurringBlocks: [],
    blocks: [],
    bookings: [],
    now: local("2026-11-01T00:00"),
    ...overrides,
    settings: { ...baseSettings, ...overrides.settings },
  };
}

const MONDAY = "2026-11-02";
const FRIDAY = "2026-11-06";
const SATURDAY = "2026-11-07";
const SUNDAY = "2026-11-08";

describe("mergeRanges", () => {
  it("merges overlapping and touching windows", () => {
    expect(mergeRanges([[1020, 1440], [0, 1440], [480, 960]])).toEqual([[0, 1440]]);
    expect(mergeRanges([[480, 960], [960, 1000], [1020, 1440]])).toEqual([[480, 1000], [1020, 1440]]);
  });
});

describe("weekday availability", () => {
  const slots = slotsForDate(MONDAY, input());
  const times = slots.map((s) => hhmm(s.start));

  it("offers morning and afternoon slots from 08:00", () => {
    expect(times[0]).toBe("08:00");
    expect(times).toContain("12:00");
    expect(slots.every((s) => s.status === "available")).toBe(true);
  });

  it("lets the last daytime meeting start at 15:30 and never at 15:45 or 16:00", () => {
    expect(times).toContain("15:30");
    expect(times).not.toContain("15:45");
    expect(times).not.toContain("16:00");
    expect(times).not.toContain("16:30");
  });

  it("offers evening slots from 17:00", () => {
    expect(times).toContain("17:00");
    expect(times.filter((t) => t >= "17:00")).toHaveLength(14);
    expect(slots).toHaveLength(16 + 14);
  });

  it("does not allow a 45 minute meeting to run past 16:00", () => {
    const t = slotsForDate(MONDAY, input({ settings: { meetingDurationMin: 45 } })).map((s) => hhmm(s.start));
    expect(t).toContain("15:00");
    expect(t).not.toContain("15:30");
  });

  it("supports a start interval shorter than the meeting", () => {
    const t = slotsForDate(MONDAY, input({ settings: { meetingDurationMin: 30, slotIntervalMin: 15 } })).map((s) =>
      hhmm(s.start),
    );
    expect(t).toContain("15:30");
    expect(t).not.toContain("15:45");
    expect(t).toContain("08:15");
  });
});

describe("midnight handling", () => {
  it("lets the last evening meeting end exactly at midnight, never after", () => {
    const slots = slotsForDate(MONDAY, input());
    const last = slots[slots.length - 1];
    expect(hhmm(last.start)).toBe("23:30");
    expect(last.end.getTime()).toBe(local("2026-11-03T00:00").getTime());
    for (const s of slots) expect(s.end.getTime()).toBeLessThanOrEqual(local("2026-11-03T00:00").getTime());
  });

  it("does not create a 45 minute slot crossing midnight", () => {
    const slots = slotsForDate(MONDAY, input({ settings: { meetingDurationMin: 45 } }));
    expect(hhmm(slots[slots.length - 1].start)).toBe("23:00");
  });
});

describe("weekends", () => {
  it.each([SATURDAY, SUNDAY])("%s is bookable all day without duplicate evening slots", (date) => {
    const slots = slotsForDate(date, input());
    const times = slots.map((s) => hhmm(s.start));
    expect(slots).toHaveLength(48);
    expect(new Set(times).size).toBe(48);
    expect(times[0]).toBe("00:00");
    expect(times).toContain("16:00");
    expect(times[47]).toBe("23:30");
  });

  it("merges overlapping weekly rules", () => {
    const rules = [...DEFAULT_RULES, { dayOfWeek: 1, startMinute: 600, endMinute: 1080 }];
    const times = slotsForDate(MONDAY, input({ rules })).map((s) => hhmm(s.start));
    expect(new Set(times).size).toBe(times.length);
    expect(times).toContain("16:00"); // the extra rule fills the 16:00-17:00 gap
    expect(times).toEqual([...times].sort());
  });
});

describe("bookings, blocks and buffers", () => {
  it("marks a manually blocked period as blocked", () => {
    const slots = slotsForDate(
      MONDAY,
      input({ blocks: [{ start: local(`${MONDAY}T10:00`), end: local(`${MONDAY}T11:30`) }] }),
    );
    const status = Object.fromEntries(slots.map((s) => [hhmm(s.start), s.status]));
    expect(status["09:30"]).toBe("available");
    expect(status["10:00"]).toBe("blocked");
    expect(status["11:00"]).toBe("blocked");
    expect(status["11:30"]).toBe("available");
  });

  it("marks a slot with a confirmed booking as booked", () => {
    const slots = slotsForDate(
      MONDAY,
      input({ bookings: [{ start: local(`${MONDAY}T09:00`), end: local(`${MONDAY}T09:30`) }] }),
    );
    const status = Object.fromEntries(slots.map((s) => [hhmm(s.start), s.status]));
    expect(status["08:30"]).toBe("available");
    expect(status["09:00"]).toBe("booked");
    expect(status["09:30"]).toBe("available");
  });

  it("applies buffer time on both sides of existing bookings", () => {
    const slots = slotsForDate(
      MONDAY,
      input({
        settings: { bufferMin: 15 },
        // booked 09:00-09:30, occupying until 09:45 with its buffer
        bookings: [{ start: local(`${MONDAY}T09:00`), end: local(`${MONDAY}T09:45`) }],
      }),
    );
    const status = Object.fromEntries(slots.map((s) => [hhmm(s.start), s.status]));
    expect(status["08:30"]).toBe("booked"); // would end 09:00 + 15 min buffer
    expect(status["09:30"]).toBe("booked");
    expect(status["10:00"]).toBe("available");
  });

  it("applies recurring weekly blocks such as Friday afternoons", () => {
    const slots = slotsForDate(
      FRIDAY,
      input({ recurringBlocks: [{ dayOfWeek: 5, startMinute: 720, endMinute: 1440 }] }),
    );
    const status = Object.fromEntries(slots.map((s) => [hhmm(s.start), s.status]));
    expect(status["11:30"]).toBe("available");
    expect(status["12:00"]).toBe("blocked");
    expect(status["20:00"]).toBe("blocked");
  });
});

describe("booking restrictions", () => {
  it("hides slots inside the minimum notice period", () => {
    const slots = slotsForDate(MONDAY, input({ now: local(`${MONDAY}T10:10`), settings: { minNoticeMin: 120 } }));
    expect(hhmm(slots[0].start)).toBe("12:30");
  });

  it("hides past slots on the current day", () => {
    const slots = slotsForDate(MONDAY, input({ now: local(`${MONDAY}T15:10`) }));
    expect(hhmm(slots[0].start)).toBe("15:30");
  });

  it("offers nothing beyond the booking horizon", () => {
    const now = local("2026-11-01T09:00");
    expect(slotsForDate("2026-11-15", input({ now, settings: { maxHorizonDays: 14 } }))).not.toHaveLength(0);
    expect(slotsForDate("2026-11-16", input({ now, settings: { maxHorizonDays: 14 } }))).toHaveLength(0);
  });

  it("offers nothing for past dates", () => {
    expect(slotsForDate("2026-10-30", input())).toHaveLength(0);
  });
});

describe("time zone", () => {
  it("interprets times in Europe/Tirane, including summer time", () => {
    const winter = slotsForDate(MONDAY, input())[0];
    expect(winter.start.toISOString()).toBe("2026-11-02T07:00:00.000Z"); // UTC+1
    const summer = slotsForDate("2027-06-07", input({ now: local("2027-06-01T00:00") }))[0];
    expect(summer.start.toISOString()).toBe("2027-06-07T06:00:00.000Z"); // UTC+2
  });

  it("skips wall-clock times that don't exist when clocks go forward", () => {
    const slots = slotsForDate("2027-03-28", input({ now: local("2027-03-20T00:00") }));
    const times = slots.map((s) => hhmm(s.start));
    expect(times).not.toContain("02:00");
    expect(times).toContain("03:00");
    for (const s of slots) expect(s.end.getTime() - s.start.getTime()).toBe(30 * 60_000);
  });

  it("produces unique, ordered instants when clocks go back", () => {
    const slots = slotsForDate("2026-10-25", input({ now: local("2026-10-20T00:00") }));
    const ms = slots.map((s) => s.start.getTime());
    expect(new Set(ms).size).toBe(ms.length);
    expect(ms).toEqual([...ms].sort((a, b) => a - b));
    expect(slots[slots.length - 1].end.getTime()).toBe(local("2026-10-26T00:00").getTime());
  });

  it("returns absolute instants, so viewers in other zones see the same moment", () => {
    const s = slotsForDate(MONDAY, input())[0];
    expect(DateTime.fromJSDate(s.start, { zone: "America/New_York" }).toFormat("HH:mm")).toBe("02:00");
    expect(DateTime.fromJSDate(s.start, { zone: TZ }).toFormat("HH:mm")).toBe("08:00");
  });
});
