import type { NextRequest } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";
import { errorJson, json, sameOrigin } from "@/lib/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Request blocked.");
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
