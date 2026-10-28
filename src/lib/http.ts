import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { currentAdmin, type Admin } from "./auth";
import { BookingError } from "./services/bookings";
import { BlockConflictError } from "./services/blocks";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(status: number, error: string, message: string, extra: object = {}) {
  return json({ error, message, ...extra }, status);
}

/** Maps known errors to friendly JSON responses; never leaks internals. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return errorJson(400, "invalid_input", issues[0]?.message ?? "Please check the form.", { issues });
  }
  if (err instanceof BookingError) {
    const status = err.code === "not_found" ? 404 : 409;
    return errorJson(status, err.code, err.message);
  }
  if (err instanceof BlockConflictError) {
    return errorJson(409, "block_conflict", err.message, { conflicts: err.conflicts });
  }
  if (err instanceof SyntaxError) return errorJson(400, "invalid_json", "The request could not be read.");
  console.error(err);
  return errorJson(500, "server_error", "Something went wrong on our side. Please try again.");
}

/**
 * Blocks cross-site form posts against cookie-authenticated endpoints: mutating
 * requests must come from this site's own origin.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function requireAdmin(req: NextRequest): Promise<Admin | NextResponse> {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return errorJson(403, "forbidden", "Request blocked.");
  }
  const admin = await currentAdmin();
  if (!admin) return errorJson(401, "unauthorized", "Please sign in.");
  return admin;
}

// Simple in-memory rate limiter. Good enough for a single server instance; on
// multi-instance hosting it limits per instance.
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  if (process.env.DISABLE_RATE_LIMIT === "true") return false;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return false;
  }
  b.count++;
  return b.count > limit;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
