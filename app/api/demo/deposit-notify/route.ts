import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requestIp, systemAuditContext } from "@/lib/audit";
import { processDepositNotification, requireNotifySecret } from "@/lib/deposits/notify";

/**
 * POST /api/demo/deposit-notify — simulated bank deposit notification.
 *
 * Mimics the callback a virtual-account bank sends when money arrives. The
 * whole flow lives in lib/deposits/notify.ts (shared with the konbini
 * notification): mandatory `mode`, idempotent `eventId` / content hash,
 * reconciliation through the normal `deposit` action, and unmatched deposits
 * (202) for missing / unknown ids, other-mode, expired or cancelled
 * transactions. Every notification is written to the deposit notification log.
 *
 * Authentication: `Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>`. When the
 * variable is not set the endpoint is open outside production (local demos)
 * and disabled (404) in production. Not admin traffic, so the IP block list
 * does not apply (the middleware also skips CSRF / session for this path).
 */
export const POST = withApiHandler(
  async (req) => {
    requireNotifySecret(req);
    const outcome = await processDepositNotification(prisma, { source: "bank", raw: await readJson(req), audit: systemAuditContext("bank", requestIp(req)) });
    return ok(outcome.body, { status: outcome.status });
  },
  { ipRestricted: false },
);
