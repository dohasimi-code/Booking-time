import type { NextRequest } from "next/server";
import { createSession, SESSION_COOKIE, verifyCredentials } from "@/lib/auth";
import { clientIp, errorJson, handleError, json, rateLimited, sameOrigin } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return errorJson(403, "forbidden", "Request blocked.");
    const { email, password } = loginSchema.parse(await req.json());
    if (rateLimited(`login:${clientIp(req)}`, 10, 15 * 60_000) || rateLimited(`login:${email}`, 10, 15 * 60_000)) {
      return errorJson(429, "rate_limited", "Too many sign-in attempts. Please wait 15 minutes.");
    }
    const admin = await verifyCredentials(email, password);
    if (!admin) return errorJson(401, "invalid_credentials", "That email and password don't match.");
    const { token, expires } = await createSession(admin.id);
    const res = json({ ok: true, name: admin.name });
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
