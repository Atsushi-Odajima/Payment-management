import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { runCron } from "@/lib/cron/run";
import { runDailyDigests } from "@/lib/notifications/digest";
import { dispatchPendingNotifications } from "@/lib/notifications/deliver";

/**
 * Hourly cron (vercel.json, :50): daily digests (overdue transfers / konbini
 * payments, chargeback deadlines — one per business day) and the e-mail /
 * Slack fan-out of notifications that were emitted inside a transaction.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  return ok(
    await runCron("notifications", async () => {
      const digests = await runDailyDigests(prisma);
      const dispatch = await dispatchPendingNotifications(prisma);
      return { ...digests, ...dispatch };
    }),
  );
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
