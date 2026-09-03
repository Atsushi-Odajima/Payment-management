import { maskCustomerFields } from "@/lib/pii/mask";
import { notFound } from "next/navigation";
import { PaymentDetailView } from "@/components/views/payment-detail-view";
import { loadTransactionDetail } from "@/lib/payments/detail";

export const dynamic = "force-dynamic";

/** Same detail as /payments/[id]; only the breadcrumb / manual link differ. */
export default async function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const payment = await loadTransactionDetail(params.id);
  if (!payment) notFound();
  return <PaymentDetailView payment={maskCustomerFields(payment, "masked")} origin="applications" />;
}
