import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requestIp, systemAuditContext } from "@/lib/audit";
import { processDepositNotification, requireNotifySecret } from "@/lib/deposits/notify";

/**
 * POST /api/demo/cvs-notify — simulated konbini payment notification (Phase K-1).
 *
 * Mimics the callback a convenience-store payment network sends when the
 * customer pays at the till. Same implementation as the bank notification
 * (lib/deposits/notify.ts): mandatory `mode`, idempotent `eventId`, the
 * `deposit` reconciliation with actor "cvs", unmatched deposits (202) for
 * other-mode / expired / cancelled slips, and the deposit notification log.
 *
 * Authentication: `Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>` (shared with
 * the bank notification). Open outside production when the variable is not
 * set, disabled (404) in production.
 */
export const POST = withApiHandler(
  async (req) => {
    requireNotifySecret(req);
    const outcome = await processDepositNotification(prisma, { source: "cvs", raw: await readJson(req), audit: systemAuditContext("cvs", requestIp(req)) });
    return ok(outcome.body, { status: outcome.status });
  },
  { ipRestricted: false },
);
