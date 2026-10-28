import type { NextRequest } from "next/server";
import { adminExists, createFirstAdmin, createSession, SESSION_COOKIE, setupCodeConfigured, setupCodeMatches } from "@/lib/auth";
import { clientIp, errorJson, handleError, json, rateLimited, sameOrigin } from "@/lib/http";
import { setupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// One-time creation of Donald's login on a fresh deployment. Requires the secret
// ADMIN_SETUP_CODE from the hosting settings, and stops working once an admin exists.
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return errorJson(403, "forbidden", "Request blocked.");
    if (rateLimited(`setup:${clientIp(req)}`, 10, 15 * 60_000)) {
      return errorJson(429, "rate_limited", "Too many attempts. Please wait 15 minutes.");
    }
    if (await adminExists()) return errorJson(409, "already_set_up", "An admin account already exists. Please sign in.");
    if (!setupCodeConfigured()) return errorJson(403, "setup_disabled", "Setup is not enabled on this server.");
    const input = setupSchema.parse(await req.json());
    if (!setupCodeMatches(input.code)) return errorJson(401, "invalid_code", "That setup code is not correct.");
    const admin = await createFirstAdmin(input.name, input.email, input.password);
    if (!admin) return errorJson(409, "already_set_up", "An admin account already exists. Please sign in.");
    const { token, expires } = await createSession(admin.id);
    const res = json({ ok: true }, 201);
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires,
    });
    return res;
  } catch (err) {
    return handleError(err);
  }
}
