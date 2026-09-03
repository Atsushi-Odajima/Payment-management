import { prisma } from "@/lib/db";
import { runCron } from "@/lib/cron/run";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { systemAuditContext } from "@/lib/audit";
import { resumeDueControls } from "@/lib/payments/method-controls";

/**
 * Cron (vercel.json, hourly at :45): resume every payment-method switch whose
 * scheduled resume time has passed. Protected by CRON_SECRET like the others.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  return ok(await runCron("payment-method-controls", () => resumeDueControls(prisma, systemAuditContext("cron"))));
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
