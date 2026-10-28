import type { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getPool } from "@/lib/db";
import { errorJson, handleError, json } from "@/lib/http";
import { getAvailability } from "@/lib/services/availability";
import { dateString } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Public endpoint. Returns only start/end instants and a status per slot. It never
// returns names, contact details, titles, notes or block reasons.
export async function GET(req: NextRequest) {
  try {
    const from = dateString.parse(req.nextUrl.searchParams.get("from"));
    const to = dateString.parse(req.nextUrl.searchParams.get("to"));
    const span = DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days;
    if (span < 0 || span > 45) return errorJson(400, "invalid_range", "Please request at most 45 days.");

    const { settings, first, last, days } = await getAvailability(getPool(), from, to);
    return json({
      ownerName: settings.ownerName,
      timezone: settings.timezone,
      durationMinutes: settings.meetingDurationMin,
      firstDate: first,
      lastDate: last,
      days: days.map((d) => ({
        date: d.date,
        slots: d.slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), status: s.status })),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}
