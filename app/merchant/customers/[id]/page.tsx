import { notFound } from "next/navigation";
import { MerchantCustomerDetailView } from "@/components/views/merchant/customers-view";
import { loadCustomer } from "@/lib/customers/list";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";

export const dynamic = "force-dynamic";

export default async function MerchantCustomerDetailPage({ params }: { params: { id: string } }) {
  const m = await requireMerchantPage();
  const customer = await loadCustomer(params.id, "full", m.id);
  if (!customer) notFound();
  return <MerchantCustomerDetailView customer={customer} />;
}
