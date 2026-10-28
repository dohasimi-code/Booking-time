import type { NextRequest } from "next/server";
import { clientIp, errorJson, handleError, json, rateLimited } from "@/lib/http";
import { createPublicBooking } from "@/lib/services/bookings";
import { publicBookingSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (rateLimited(`book:${clientIp(req)}`, 10, 10 * 60_000)) {
      return errorJson(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");
    }
    const input = publicBookingSchema.parse(await req.json());
    const { booking, manageToken } = await createPublicBooking(input.start, input);
    // Only the visitor's own booking is returned, and only what the confirmation page needs.
    return json(
      {
        reference: booking.reference,
        start: booking.startsAt.toISOString(),
        end: booking.endsAt.toISOString(),
        name: booking.visitorName,
        title: booking.title,
        manageToken,
      },
      201,
    );
  } catch (err) {
    return handleError(err);
  }
}
