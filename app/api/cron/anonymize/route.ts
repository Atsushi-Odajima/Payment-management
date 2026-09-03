import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { timingSafeEqualBytes } from "@/lib/auth";
import { systemAuditContext } from "@/lib/audit";
import { runCron } from "@/lib/cron/run";
import { runRetention } from "@/lib/customers/service";

/**
 * Daily cron (vercel.json, 19:00 UTC = 04:00 JST): anonymise customers idle
 * for the configured retention, scrub orphan transactions and prune audit
 * rows past the audit retention (Phase M-2). Protected by CRON_SECRET.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(404, "not_found", "errors.notFound");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
    throw new ApiError(401, "unauthorized", "errors.unauthorized");
  }
  return ok(await runCron("anonymize", () => runRetention(prisma, systemAuditContext("cron"))));
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
