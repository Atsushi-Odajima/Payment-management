import { notFound } from "next/navigation";
import { PaymentDetailView } from "@/components/views/payment-detail-view";
import { loadTransactionDetail } from "@/lib/payments/detail";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const payment = await loadTransactionDetail(params.id);
  if (!payment) notFound();
  return <PaymentDetailView payment={payment} origin="payments" />;
}
