import { getPool, withTransaction } from "../db";
import type { Settings } from "../settings";

export interface RuleRow {
  id?: number;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
}

export interface RecurringBlockRow {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  reason: string | null;
  active: boolean;
}

export async function listRules(): Promise<RuleRow[]> {
  const { rows } = await getPool().query(
    "select id, day_of_week, start_minute, end_minute, active from availability_rules order by day_of_week, start_minute",
  );
  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    active: r.active,
  }));
}

/** Replaces the whole weekly schedule in one transaction. */
export async function replaceRules(actor: string, rules: RuleRow[]): Promise<RuleRow[]> {
  await withTransaction(async (client) => {
    await client.query("delete from availability_rules");
    for (const r of rules) {
      await client.query(
        "insert into availability_rules (day_of_week, start_minute, end_minute, active) values ($1, $2, $3, $4)",
        [r.dayOfWeek, r.startMinute, r.endMinute, r.active],
      );
    }
    await client.query("insert into audit_log (actor, action, details) values ($1, 'schedule.updated', $2)", [
      actor,
      JSON.stringify({ rules: rules.length }),
    ]);
  });
  return listRules();
}

export async function listRecurringBlocks(): Promise<RecurringBlockRow[]> {
  const { rows } = await getPool().query(
    "select id, day_of_week, start_minute, end_minute, reason, active from recurring_blocks order by day_of_week, start_minute",
  );
  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    reason: r.reason,
    active: r.active,
  }));
}

export async function replaceRecurringBlocks(actor: string, blocks: RecurringBlockRow[]): Promise<RecurringBlockRow[]> {
  await withTransaction(async (client) => {
    await client.query("delete from recurring_blocks");
    for (const b of blocks) {
      await client.query(
        "insert into recurring_blocks (day_of_week, start_minute, end_minute, reason, active) values ($1, $2, $3, $4, $5)",
        [b.dayOfWeek, b.startMinute, b.endMinute, b.reason || null, b.active],
      );
    }
    await client.query("insert into audit_log (actor, action, details) values ($1, 'recurring_blocks.updated', $2)", [
      actor,
      JSON.stringify({ blocks: blocks.length }),
    ]);
  });
  return listRecurringBlocks();
}

export async function updateSettings(actor: string, s: Partial<Settings>): Promise<void> {
  await getPool().query(
    `update settings set
       owner_name = coalesce($1, owner_name),
       owner_email = coalesce($2, owner_email),
       meeting_duration_min = coalesce($3, meeting_duration_min),
       slot_interval_min = coalesce($4, slot_interval_min),
       buffer_min = coalesce($5, buffer_min),
       min_notice_min = coalesce($6, min_notice_min),
       max_horizon_days = coalesce($7, max_horizon_days),
       timezone = coalesce($8, timezone),
       updated_at = now()
     where id = 1`,
    [
      s.ownerName ?? null,
      s.ownerEmail ?? null,
      s.meetingDurationMin ?? null,
      s.slotIntervalMin ?? null,
      s.bufferMin ?? null,
      s.minNoticeMin ?? null,
      s.maxHorizonDays ?? null,
      s.timezone ?? null,
    ],
  );
  await getPool().query("insert into audit_log (actor, action, details) values ($1, 'settings.updated', $2)", [
    actor,
    JSON.stringify(s),
  ]);
}
