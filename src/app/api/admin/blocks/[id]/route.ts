import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorJson, handleError, json, requireAdmin } from "@/lib/http";
import { deleteBlock, saveBlock } from "@/lib/services/blocks";
import { blockSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const id = z.uuid().parse((await ctx.params).id);
    const input = blockSchema.parse(await req.json());
    return json(await saveBlock(`admin:${admin.email}`, { ...input, id }, input.conflictAction));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const id = z.uuid().parse((await ctx.params).id);
    if (!(await deleteBlock(`admin:${admin.email}`, id))) return errorJson(404, "not_found", "Block not found.");
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
