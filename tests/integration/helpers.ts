import { DateTime } from "luxon";
import { getPool } from "@/lib/db";

export const TZ = "Europe/Tirane";

export async function resetDb(settings: Record<string, number> = {}) {
  const db = getPool();
  await db.query("truncate bookings, blocked_periods, recurring_blocks, audit_log, admin_sessions, admin_users cascade");
  await db.query(
    `update settings set meeting_duration_min = $1, slot_interval_min = $2, buffer_min = $3,
       min_notice_min = $4, max_horizon_days = $5, owner_email = null`,
    [
      settings.meetingDurationMin ?? 30,
      settings.slotIntervalMin ?? 30,
      settings.bufferMin ?? 0,
      settings.minNoticeMin ?? 0,
      settings.maxHorizonDays ?? 60,
    ],
  );
}

/** The next date (yyyy-mm-dd) with this ISO weekday, at least `minDays` from today in Tirane. */
export function nextWeekday(weekday: number, minDays = 3): string {
  let d = DateTime.now().setZone(TZ).startOf("day").plus({ days: minDays });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

export const at = (date: string, time: string) => DateTime.fromISO(`${date}T${time}`, { zone: TZ }).toJSDate();

export const visitor = (n = 1) => ({
  name: `Visitor Number${n}`,
  email: `visitor${n}@example.com`,
  phone: "+355 69 000 0000",
  title: `Secret project ${n}`,
  notes: `Private note ${n}`,
});
