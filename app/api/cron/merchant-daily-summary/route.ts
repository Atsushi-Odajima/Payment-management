import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { runCron } from "@/lib/cron/run";
import { sendMerchantDailySummaries } from "@/lib/email/merchant-digest";

/**
 * Daily cron (vercel.json, 00:00 UTC = 09:00 JST): the previous day's payment
 * summary for merchants whose e-mail notification setting is "daily"
 * (Phase P2-2, lib/email/merchant-digest.ts). Protected by CRON_SECRET.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  return ok(await runCron("merchant-daily-summary", () => sendMerchantDailySummaries(prisma)));
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
