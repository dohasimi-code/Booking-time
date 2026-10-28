import type { Db } from "./db";
import type { SchedulingSettings, WeeklyWindow } from "./availability";

export interface Settings extends SchedulingSettings {
  ownerName: string;
  ownerEmail: string | null;
  publicSlug: string;
}

export const DURATION_OPTIONS = [15, 30, 45, 60] as const;
export const BUFFER_OPTIONS = [0, 5, 10, 15] as const;

export async function getSettings(db: Db, opts: { forUpdate?: boolean } = {}): Promise<Settings> {
  const { rows } = await db.query(
    `select owner_name, owner_email, public_slug, timezone, meeting_duration_min, slot_interval_min,
            buffer_min, min_notice_min, max_horizon_days
       from settings where id = 1 ${opts.forUpdate ? "for update" : ""}`,
  );
  const r = rows[0];
  if (!r) throw new Error("Settings row missing; run migrations");
  return {
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    publicSlug: r.public_slug,
    timezone: r.timezone,
    meetingDurationMin: r.meeting_duration_min,
    slotIntervalMin: r.slot_interval_min,
    bufferMin: r.buffer_min,
    minNoticeMin: r.min_notice_min,
    maxHorizonDays: r.max_horizon_days,
  };
}

export async function getActiveRules(db: Db): Promise<WeeklyWindow[]> {
  const { rows } = await db.query(
    "select day_of_week, start_minute, end_minute from availability_rules where active order by day_of_week, start_minute",
  );
  return rows.map((r) => ({ dayOfWeek: r.day_of_week, startMinute: r.start_minute, endMinute: r.end_minute }));
}

export async function getActiveRecurringBlocks(db: Db): Promise<WeeklyWindow[]> {
  const { rows } = await db.query(
    "select day_of_week, start_minute, end_minute from recurring_blocks where active",
  );
  return rows.map((r) => ({ dayOfWeek: r.day_of_week, startMinute: r.start_minute, endMinute: r.end_minute }));
}
