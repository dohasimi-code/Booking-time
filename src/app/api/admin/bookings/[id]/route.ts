import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorJson, handleError, json, requireAdmin } from "@/lib/http";
import { getPool } from "@/lib/db";
import {
  cancelBooking,
  deleteBooking,
  getBookingById,
  rescheduleBooking,
  updateBookingDetails,
} from "@/lib/services/bookings";
import { adminBookingUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function bookingId(ctx: Ctx) {
  return z.uuid().parse((await ctx.params).id);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const id = await bookingId(ctx);
    const booking = await getBookingById(id);
    if (!booking) return errorJson(404, "not_found", "Booking not found.");
    const { rows: history } = await getPool().query(
      "select actor, action, details, created_at from audit_log where booking_id = $1 order by created_at",
      [id],
    );
    return json({ booking, history });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const id = await bookingId(ctx);
    const actor = `admin:${admin.email}`;
    const input = adminBookingUpdateSchema.parse(await req.json());
    let booking;
    if (input.action === "cancel") {
      booking = await cancelBooking({ id }, { kind: "admin", label: actor }, input);
    } else if (input.action === "reschedule") {
      booking = await rescheduleBooking({ id }, input.start, { kind: "admin", label: actor }, input);
    } else if (input.action === "complete") {
      const { rows } = await getPool().query(
        "update bookings set status = 'completed', updated_at = now() where id = $1 and status = 'confirmed' returning id",
        [id],
      );
      if (!rows[0]) return errorJson(409, "invalid_state", "Only active bookings can be marked as completed.");
      await getPool().query("insert into audit_log (actor, action, booking_id) values ($1, 'booking.completed', $2)", [
        actor,
        id,
      ]);
      booking = await getBookingById(id);
    } else {
      const { action: _action, ...fields } = input;
      void _action;
      booking = await updateBookingDetails(actor, id, fields);
    }
    return json({ booking });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    await deleteBooking(`admin:${admin.email}`, await bookingId(ctx));
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
