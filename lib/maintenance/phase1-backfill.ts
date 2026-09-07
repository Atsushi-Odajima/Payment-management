// Idempotent data backfill for the Phase P1 schema changes. Runs at the end
// of the seed and from `npm run db:backfill` against an existing database:
//
//   - konbini slips still recorded as pending + cvsReceiptNo → awaiting_payment
//     (the migration does the same in SQL; this covers `prisma db push` deploys)
//   - confirmed-or-later settlement batches without an invoice number get one,
//     in period order, so numbers stay stable across runs

import type { PrismaClient } from "@prisma/client";
import { nextInvoiceNo } from "@/lib/settlements/service";

export interface BackfillSummary {
  awaitingPayment: number;
  invoiceNumbers: number;
}

export async function runPhase1Backfill(db: PrismaClient): Promise<BackfillSummary> {
  const converted = await db.payment.updateMany({ where: { status: "pending", cvsReceiptNo: { not: null } }, data: { status: "awaiting_payment" } });

  const batches = await db.settlementBatch.findMany({
    where: { status: { in: ["confirmed", "scheduled", "paid", "held"] }, invoiceNo: null },
    orderBy: [{ periodFrom: "asc" }, { createdAt: "asc" }],
    select: { id: true, merchantId: true, periodFrom: true, merchant: { select: { merchantCode: true } } },
  });
  let invoiceNumbers = 0;
  for (const b of batches) {
    const invoiceNo = await nextInvoiceNo(db, b);
    await db.settlementBatch.update({ where: { id: b.id }, data: { invoiceNo } });
    invoiceNumbers++;
  }
  return { awaitingPayment: converted.count, invoiceNumbers };
}
