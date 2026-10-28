import { getPool, withTransaction } from "../db";
import { cancelBooking, type BookingDetails } from "./bookings";

export interface BlockedPeriod {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdAt: Date;
}

export interface ConflictSummary {
  id: string;
  reference: string;
  visitorName: string;
  startsAt: Date;
  endsAt: Date;
}

export class BlockConflictError extends Error {
  constructor(public conflicts: ConflictSummary[]) {
    super("This period overlaps confirmed appointments.");
  }
}

/**
 * What to do when the block overlaps confirmed appointments:
 * - undefined: refuse and report the conflicts so Donald can decide
 * - "keep": save the block and keep the appointments as they are
 * - "cancel": save the block and cancel the overlapping appointments (explicit choice)
 */
export type ConflictAction = "keep" | "cancel";

function mapBlock(r: Record<string, unknown>): BlockedPeriod {
  return {
    id: r.id as string,
    startsAt: r.starts_at as Date,
    endsAt: r.ends_at as Date,
    reason: (r.reason as string) ?? null,
    createdAt: r.created_at as Date,
  };
}

export async function listBlocks(opts: { includePast?: boolean } = {}): Promise<BlockedPeriod[]> {
  const { rows } = await getPool().query(
    `select id, starts_at, ends_at, reason, created_at from blocked_periods
      ${opts.includePast ? "" : "where ends_at > now()"} order by starts_at`,
  );
  return rows.map(mapBlock);
}

export async function findConflicts(start: Date, end: Date): Promise<ConflictSummary[]> {
  const { rows } = await getPool().query(
    `select id, reference, visitor_name, starts_at, ends_at from bookings
      where status = 'confirmed' and starts_at < $2 and ends_at > $1 order by starts_at`,
    [start, end],
  );
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    visitorName: r.visitor_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  }));
}

export async function saveBlock(
  actor: string,
  input: { id?: string; start: Date; end: Date; reason?: string | null },
  conflictAction?: ConflictAction,
): Promise<{ block: BlockedPeriod; cancelled: BookingDetails[]; kept: ConflictSummary[] }> {
  const conflicts = await findConflicts(input.start, input.end);
  if (conflicts.length && !conflictAction) throw new BlockConflictError(conflicts);

  const block = await withTransaction(async (client) => {
    const { rows } = input.id
      ? await client.query(
          `update blocked_periods set starts_at = $2, ends_at = $3, reason = $4, updated_at = now()
            where id = $1 returning id, starts_at, ends_at, reason, created_at`,
          [input.id, input.start, input.end, input.reason || null],
        )
      : await client.query(
          `insert into blocked_periods (starts_at, ends_at, reason) values ($1, $2, $3)
           returning id, starts_at, ends_at, reason, created_at`,
          [input.start, input.end, input.reason || null],
        );
    if (!rows[0]) throw new Error("Blocked period not found");
    await client.query("insert into audit_log (actor, action, details) values ($1, $2, $3)", [
      actor,
      input.id ? "block.updated" : "block.created",
      JSON.stringify({ blockId: rows[0].id, conflicts: conflicts.length, conflictAction: conflictAction ?? null }),
    ]);
    return mapBlock(rows[0]);
  });

  const cancelled: BookingDetails[] = [];
  if (conflictAction === "cancel") {
    for (const c of conflicts) {
      cancelled.push(await cancelBooking({ id: c.id }, { kind: "admin", label: actor }, { notifyVisitor: true }));
    }
  }
  return { block, cancelled, kept: conflictAction === "keep" ? conflicts : [] };
}

export async function deleteBlock(actor: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query("delete from blocked_periods where id = $1", [id]);
  if (rowCount) {
    await getPool().query("insert into audit_log (actor, action, details) values ($1, 'block.deleted', $2)", [
      actor,
      JSON.stringify({ blockId: id }),
    ]);
  }
  return Boolean(rowCount);
}
