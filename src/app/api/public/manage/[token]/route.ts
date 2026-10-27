import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, errorJson, handleError, json, rateLimited } from "@/lib/http";
import { cancelBooking, getBookingByToken, rescheduleBooking, type BookingDetails } from "@/lib/services/bookings";

export const dynamic = "force-dynamic";

// The unguessable token in the URL is the only key to a visitor's booking.
// Booking IDs and references alone can never be used to view or change a booking.

function visitorView(b: BookingDetails) {
  return {
    reference: b.reference,
    name: b.visitorName,
    email: b.visitorEmail,
    title: b.title,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    status: b.status,
  };
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (rateLimited(`manage:${clientIp(req)}`, 60, 10 * 60_000)) {
    return errorJson(429, "rate_limited", "Too many attempts. Please wait a few minutes.");
  }
  const { token } = await ctx.params;
  const b = await getBookingByToken(token);
  if (!b) return errorJson(404, "not_found", "We couldn't find this booking.");
  return json(visitorView(b));
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("reschedule"), start: z.iso.datetime({ offset: true }).transform((s) => new Date(s)) }),
]);

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    if (rateLimited(`manage:${clientIp(req)}`, 60, 10 * 60_000)) {
      return errorJson(429, "rate_limited", "Too many attempts. Please wait a few minutes.");
    }
    const { token } = await ctx.params;
    if (!(await getBookingByToken(token))) return errorJson(404, "not_found", "We couldn't find this booking.");
    const input = actionSchema.parse(await req.json());
    const b =
      input.action === "cancel"
        ? await cancelBooking({ token }, { kind: "visitor" })
        : await rescheduleBooking({ token }, input.start, { kind: "visitor" });
    return json(visitorView(b));
  } catch (err) {
    return handleError(err);
  }
}
