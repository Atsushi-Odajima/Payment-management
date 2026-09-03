// Expire bank transfers (B-3) and konbini slips (Phase K-1) still awaited
// after their deadline. Used by the hourly cron route; each transition goes
// through the state machine with actor "system" and a "cron" audit entry.

import { prisma } from "@/lib/db";
import { applyPaymentAction } from "@/lib/payments/actions";
import { systemAuditContext } from "@/lib/audit";

const BATCH = 200;

/** Expire every awaiting transfer / pending konbini slip whose deadline has passed (real time — the state machine re-checks it). */
export async function expireOverdueTransfers(): Promise<{ expired: number; skipped: number }> {
  const due = await prisma.payment.findMany({
    where: { transferDueAt: { lt: new Date() }, OR: [{ status: "awaiting_transfer" }, { status: "pending", cvsReceiptNo: { not: null } }] },
    select: { id: true },
    take: BATCH,
  });
  let expired = 0;
  let skipped = 0;
  for (const p of due) {
    try {
      await applyPaymentAction(prisma, { paymentId: p.id, action: "expire", actor: "system", audit: systemAuditContext("cron") });
      expired++;
    } catch {
      // Raced with an operator (deposit / cancel); the next run re-evaluates.
      skipped++;
    }
  }
  return { expired, skipped };
}
