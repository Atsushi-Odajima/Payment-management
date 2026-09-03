import { notFound } from "next/navigation";
import { CustomerDetailView } from "@/components/views/customer-detail-view";
import { loadCustomer } from "@/lib/customers/list";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await loadCustomer(params.id, "masked");
  if (!customer) notFound();
  return <CustomerDetailView customer={customer} />;
}
