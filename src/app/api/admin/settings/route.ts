import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { handleError, json, requireAdmin } from "@/lib/http";
import { updateSettings } from "@/lib/services/schedule";
import { getSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return json({ settings: await getSettings(getPool()), emailConfigured: emailConfigured() });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    await updateSettings(`admin:${admin.email}`, settingsSchema.parse(await req.json()));
    return json({ settings: await getSettings(getPool()), emailConfigured: emailConfigured() });
  } catch (err) {
    return handleError(err);
  }
}
