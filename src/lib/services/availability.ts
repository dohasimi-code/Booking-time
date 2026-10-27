import { DateTime } from "luxon";
import type { Db } from "../db";
import {
  bookableDateRange,
  eachDate,
  slotsForDate,
  type AvailabilityInput,
  type Slot,
} from "../availability";
import { getActiveRecurringBlocks, getActiveRules, getSettings, type Settings } from "../settings";

/**
 * Loads only the minimum data needed to compute availability: start/end instants of
 * confirmed bookings and blocks. No names, emails, titles or reasons are ever selected here.
 */
export async function loadAvailabilityInput(
  db: Db,
  from: Date,
  to: Date,
  opts: { settings?: Settings; excludeBookingId?: string; now?: Date } = {},
): Promise<AvailabilityInput & { settings: Settings }> {
  const settings = opts.settings ?? (await getSettings(db));
  const [rules, recurringBlocks, blocks, bookings] = await Promise.all([
    getActiveRules(db),
    getActiveRecurringBlocks(db),
    db.query(
      "select starts_at, ends_at from blocked_periods where starts_at < $2 and ends_at > $1",
      [from, to],
    ),
    db.query(
      `select starts_at, occupied_until from bookings
        where status = 'confirmed' and starts_at < $2 and occupied_until > $1
          and ($3::uuid is null or id <> $3::uuid)`,
      [from, to, opts.excludeBookingId ?? null],
    ),
  ]);
  return {
    settings,
    rules,
    recurringBlocks,
    blocks: blocks.rows.map((r) => ({ start: r.starts_at, end: r.ends_at })),
    bookings: bookings.rows.map((r) => ({ start: r.starts_at, end: r.occupied_until })),
    now: opts.now ?? new Date(),
  };
}

export interface DayAvailability {
  date: string;
  slots: Slot[];
}

/** Availability for local dates [from, to], clamped to the bookable range. */
export async function getAvailability(
  db: Db,
  from: string,
  to: string,
  opts: { now?: Date; excludeBookingId?: string; ignoreLimits?: boolean } = {},
): Promise<{ settings: Settings; first: string; last: string; days: DayAvailability[] }> {
  const settings = await getSettings(db);
  const now = opts.now ?? new Date();
  const range = bookableDateRange(settings, now);
  const zone = settings.timezone;
  const start = from < range.first ? range.first : from;
  const end = to > range.last ? range.last : to;
  if (start > end) return { settings, ...range, days: [] };

  const fromInstant = DateTime.fromISO(start, { zone }).startOf("day").minus({ days: 1 }).toJSDate();
  const toInstant = DateTime.fromISO(end, { zone }).endOf("day").plus({ days: 1 }).toJSDate();
  const input = await loadAvailabilityInput(db, fromInstant, toInstant, {
    settings,
    now,
    excludeBookingId: opts.excludeBookingId,
  });
  const days = eachDate(start, end).map((date) => ({ date, slots: slotsForDate(date, input) }));
  return { settings, ...range, days };
}

/**
 * Re-checks one requested start time against the live schedule. Used inside the booking
 * transaction, so it must be called with the transaction's client.
 */
export async function findAvailableSlot(
  db: Db,
  settings: Settings,
  start: Date,
  opts: { now?: Date; excludeBookingId?: string; ignoreNoticeAndHorizon?: boolean } = {},
): Promise<Slot | null> {
  const zone = settings.timezone;
  const date = DateTime.fromJSDate(start, { zone }).toISODate()!;
  const dayStart = DateTime.fromISO(date, { zone }).startOf("day");
  const input = await loadAvailabilityInput(
    db,
    dayStart.minus({ days: 1 }).toJSDate(),
    dayStart.plus({ days: 2 }).toJSDate(),
    { settings, now: opts.now, excludeBookingId: opts.excludeBookingId },
  );
  if (opts.ignoreNoticeAndHorizon) {
    // Donald may place bookings at short notice; the past is still off-limits.
    input.settings = { ...settings, minNoticeMin: 0, maxHorizonDays: 3650 };
  }
  const slot = slotsForDate(date, input).find((s) => s.start.getTime() === start.getTime());
  return slot && slot.status === "available" ? slot : null;
}
