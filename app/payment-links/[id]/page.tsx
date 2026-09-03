import { notFound } from "next/navigation";
import { PaymentLinkDetailView } from "@/components/views/payment-link-detail-view";
import { loadPaymentLink } from "@/lib/payment-links/list";

export const dynamic = "force-dynamic";

export default async function PaymentLinkDetailPage({ params }: { params: { id: string } }) {
  const data = await loadPaymentLink(params.id);
  if (!data) notFound();
  return <PaymentLinkDetailView link={data.link} payments={data.payments} />;
}
