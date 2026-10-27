import { NextResponse, type NextRequest } from "next/server";
import { handleError, json, requireAdmin } from "@/lib/http";
import { createAdminBooking, listBookings } from "@/lib/services/bookings";
import { adminBookingSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const p = req.nextUrl.searchParams;
    const scope = p.get("scope");
    const status = p.get("status");
    const bookings = await listBookings({
      scope: scope === "past" || scope === "all" ? scope : scope === "upcoming" ? "upcoming" : undefined,
      status: status === "confirmed" || status === "cancelled" || status === "completed" ? status : undefined,
      q: p.get("q")?.slice(0, 100) || undefined,
      from: p.get("from") ? new Date(p.get("from")!) : undefined,
      to: p.get("to") ? new Date(p.get("to")!) : undefined,
    });
    return json({ bookings });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const input = adminBookingSchema.parse(await req.json());
    const { booking } = await createAdminBooking(`admin:${admin.email}`, input.start, input, input);
    return json({ booking }, 201);
  } catch (err) {
    return handleError(err);
  }
}
