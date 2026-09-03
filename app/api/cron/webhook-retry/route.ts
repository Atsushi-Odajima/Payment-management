import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { processDueRetries } from "@/lib/webhooks/deliver";

/**
 * Cron (vercel.json, hourly): retry webhook deliveries whose backoff has
 * elapsed (1 min → 5 min → 30 min → 2 h → 24 h; abandoned after 5 tries).
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
  return ok(await processDueRetries(prisma));
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
