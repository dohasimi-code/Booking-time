import { NextResponse, type NextRequest } from "next/server";
import { handleError, json, requireAdmin } from "@/lib/http";
import { listRecurringBlocks, listRules, replaceRecurringBlocks, replaceRules } from "@/lib/services/schedule";
import { recurringBlocksSchema, rulesSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return json({ rules: await listRules(), recurringBlocks: await listRecurringBlocks() });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const actor = `admin:${admin.email}`;
    if (body.rules !== undefined) await replaceRules(actor, rulesSchema.parse(body).rules);
    if (body.blocks !== undefined) await replaceRecurringBlocks(actor, recurringBlocksSchema.parse(body).blocks);
    return json({ rules: await listRules(), recurringBlocks: await listRecurringBlocks() });
  } catch (err) {
    return handleError(err);
  }
}
