import { notFound } from "next/navigation";
import { MerchantTransactionDetailView } from "@/components/views/merchant/transaction-detail-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { loadTransactionDetail } from "@/lib/payments/detail";

export const dynamic = "force-dynamic";

/** The merchant's own transaction; internal notes are never passed to the portal. */
export default async function MerchantTransactionDetailPage({ params }: { params: { id: string } }) {
  const m = await requireMerchantPage();
  const p = await loadTransactionDetail(params.id);
  if (!p || p.merchant?.id !== m.id) notFound();
  return (
    <MerchantTransactionDetailView
      payment={{
        id: p.id,
        orderNumber: p.orderNumber,
        amount: p.amount,
        amountRefunded: p.amountRefunded,
        pendingRefundAmount: p.pendingRefundAmount,
        status: p.status,
        livemode: p.livemode,
        method: p.method,
        productName: p.productName,
        customerName: p.customerName,
        customerId: p.customerId,
        customerEmail: p.customerEmail,
        createdAt: p.createdAt,
        capturedAt: p.capturedAt,
        failureReason: p.failureReason,
        transferId: p.transferId,
        transferDueAt: p.transferDueAt,
        depositAmount: p.depositAmount,
        cvsBrand: p.cvsBrand,
        cvsReceiptNo: p.cvsReceiptNo,
        cvsPaidAt: p.cvsPaidAt,
        refundDeadlineAt: p.refundDeadlineAt,
        overdue: p.overdue,
        events: p.events.map((e) => ({ id: e.id, type: e.type, toStatus: e.toStatus, amount: e.amount, createdAt: e.createdAt })),
        refunds: p.refunds,
        receipt: p.receipt ? { receiptNo: p.receipt.receiptNo, recipientName: p.receipt.recipientName, description: p.receipt.description, reissueCount: p.receipt.reissueCount, lastIssuedAt: p.receipt.lastIssuedAt, source: p.receipt.source } : null,
      }}
    />
  );
}
