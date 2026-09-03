import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { processDueSubscriptions } from "@/lib/subscriptions/service";

/**
 * Cron (vercel.json, hourly): charge every subscription whose next charge
 * date has passed (trial end, billing interval, or a failure retry).
 * Protected by CRON_SECRET like the other cron routes.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  return ok(await processDueSubscriptions(prisma));
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
