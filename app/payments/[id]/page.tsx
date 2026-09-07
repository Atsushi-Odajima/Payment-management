import { maskCustomerFields, maskName } from "@/lib/pii/mask";
import { notFound } from "next/navigation";
import { PaymentDetailView } from "@/components/views/payment-detail-view";
import { loadTransactionDetail } from "@/lib/payments/detail";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const payment = await loadTransactionDetail(params.id);
  if (!payment) notFound();
  return <PaymentDetailView payment={maskRelatedDeposits(maskCustomerFields(payment, "masked"))} origin="payments" />;
}

/** Payer names of related deposits are personal data too (Phase M-2 masking). */
function maskRelatedDeposits<T extends { depositNotifications: Array<{ payerName: string | null }>; unmatchedCandidates: Array<{ payerName: string }> }>(p: T): T {
  return {
    ...p,
    depositNotifications: p.depositNotifications.map((n) => ({ ...n, payerName: n.payerName ? maskName(n.payerName) : null })),
    unmatchedCandidates: p.unmatchedCandidates.map((u) => ({ ...u, payerName: maskName(u.payerName) ?? "" })),
  };
}
