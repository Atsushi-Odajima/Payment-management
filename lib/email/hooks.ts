// Event → email hooks. Phase G fills these in with templated emails logged
// through lib/email/send.ts; until then they are explicit no-ops so the
// callers (deposit diffs, refunds, transfers) already have their seams.

import type { PrismaClient } from "@prisma/client";

/** A short deposit was recorded and the operator asked the customer for the balance. */
export async function notifyDepositShort(_db: PrismaClient, _paymentId: string): Promise<void> {
  void _db;
  void _paymentId;
}
