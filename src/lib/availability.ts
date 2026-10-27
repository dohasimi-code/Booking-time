import { DateTime } from "luxon";

// Pure slot-generation logic. No database access here, so it can be unit tested
// and reused identically by the public calendar and the booking transaction.

export type SlotStatus = "available" | "booked" | "blocked";

export interface WeeklyWindow {
  dayOfWeek: number; // ISO: 1 = Monday ... 7 = Sunday
  startMinute: number; // minutes since local midnight
  endMinute: number; // 1440 = midnight at the end of the day
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface SchedulingSettings {
  timezone: string;
  meetingDurationMin: number;
  slotIntervalMin: number;
  bufferMin: number;
  minNoticeMin: number;
  maxHorizonDays: number;
}

export interface AvailabilityInput {
  settings: SchedulingSettings;
  rules: WeeklyWindow[]; // active weekly availability
  recurringBlocks: WeeklyWindow[]; // active weekly blocks
  blocks: Interval[]; // one-off blocked periods
  bookings: Interval[]; // confirmed bookings: start .. occupied_until (end + buffer)
  now: Date;
}

export interface Slot {
  start: Date;
  end: Date;
  status: SlotStatus;
}

/** Merge overlapping or touching minute ranges. */
export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = ranges
    .filter(([s, e]) => e > s)
    .map(([s, e]) => [s, e] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** Local wall-clock minute on `date` (yyyy-mm-dd) to an absolute instant. 1440 = next midnight. */
export function localMinuteToDate(date: string, minute: number, zone: string): DateTime | null {
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) return null;
  const startOfDay = day.startOf("day");
  if (minute >= 1440) return startOfDay.plus({ days: 1 }).startOf("day");
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  const dt = startOfDay.set({ hour, minute: min });
  // Skip wall-clock times that do not exist (spring-forward DST gap).
  if (dt.hour !== hour || dt.minute !== min) return null;
  return dt;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** First and last bookable dates (inclusive) as yyyy-mm-dd in the owner's zone. */
export function bookableDateRange(settings: SchedulingSettings, now: Date): { first: string; last: string } {
  const local = DateTime.fromJSDate(now, { zone: settings.timezone });
  return {
    first: local.toISODate()!,
    last: local.plus({ days: settings.maxHorizonDays }).toISODate()!,
  };
}

/**
 * Slots for one local date. Slots before the minimum notice or beyond the horizon are
 * left out entirely; booked and blocked slots are returned with that status only.
 */
export function slotsForDate(date: string, input: AvailabilityInput): Slot[] {
  const { settings } = input;
  const zone = settings.timezone;
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) return [];
  const range = bookableDateRange(settings, input.now);
  if (date < range.first || date > range.last) return [];

  const weekday = day.weekday;
  const windows = mergeRanges(
    input.rules.filter((r) => r.dayOfWeek === weekday).map((r) => [r.startMinute, r.endMinute]),
  );
  if (windows.length === 0) return [];

  const duration = settings.meetingDurationMin;
  const durationMs = duration * 60_000;
  const bufferMs = settings.bufferMin * 60_000;
  const earliest = input.now.getTime() + settings.minNoticeMin * 60_000;
  const horizonEnd = DateTime.fromJSDate(input.now, { zone })
    .plus({ days: settings.maxHorizonDays })
    .endOf("day")
    .toMillis();

  const recurring = input.recurringBlocks
    .filter((b) => b.dayOfWeek === weekday)
    .map((b) => {
      const s = localMinuteToDate(date, b.startMinute, zone) ?? localMinuteToDate(date, b.startMinute + 60, zone);
      const e = localMinuteToDate(date, b.endMinute, zone) ?? localMinuteToDate(date, b.endMinute + 60, zone);
      return s && e ? { start: s.toMillis(), end: e.toMillis() } : null;
    })
    .filter((b): b is { start: number; end: number } => b !== null);
  const oneOff = input.blocks.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));
  const allBlocks = [...recurring, ...oneOff];
  const busy = input.bookings.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));

  const seen = new Set<number>();
  const slots: Slot[] = [];
  for (const [winStart, winEnd] of windows) {
    const windowEnd = localMinuteToDate(date, winEnd, zone);
    if (!windowEnd) continue;
    for (let m = winStart; m + duration <= winEnd; m += settings.slotIntervalMin) {
      const startDt = localMinuteToDate(date, m, zone);
      if (!startDt) continue;
      const start = startDt.toMillis();
      const end = start + durationMs;
      // The meeting itself must finish inside the window (and never past midnight).
      if (end > windowEnd.toMillis()) continue;
      if (start < earliest || start > horizonEnd) continue;
      if (seen.has(start)) continue;
      seen.add(start);

      let status: SlotStatus = "available";
      if (allBlocks.some((b) => overlaps(start, end, b.start, b.end))) status = "blocked";
      else if (busy.some((b) => overlaps(start, end + bufferMs, b.start, b.end))) status = "booked";
      slots.push({ start: new Date(start), end: new Date(end), status });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Every date between from and to (inclusive), as yyyy-mm-dd. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(from, { zone: "UTC" });
  const end = DateTime.fromISO(to, { zone: "UTC" });
  while (d <= end && out.length < 400) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}
