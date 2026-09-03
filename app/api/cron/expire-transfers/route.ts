import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { expireOverdueTransfers } from "@/lib/payments/expire";

/**
 * Hourly cron (vercel.json): bank transfers still awaited after their
 * deadline become "expired" (lib/payments/expire.ts). Protected by
 * CRON_SECRET like /api/demo/reset.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  const result = await expireOverdueTransfers();
  return ok(result);
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
