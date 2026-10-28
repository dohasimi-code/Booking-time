import { NextResponse, type NextRequest } from "next/server";
import { handleError, json, requireAdmin } from "@/lib/http";
import { listBlocks, saveBlock } from "@/lib/services/blocks";
import { blockSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return json({ blocks: await listBlocks({ includePast: req.nextUrl.searchParams.get("past") === "1" }) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const input = blockSchema.parse(await req.json());
    const result = await saveBlock(`admin:${admin.email}`, input, input.conflictAction);
    return json(result, 201);
  } catch (err) {
    return handleError(err);
  }
}
