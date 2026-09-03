import { MerchantCustomersView } from "@/components/views/merchant/customers-view";
import { loadCustomers, parseCustomerFilters, parseCustomerSort } from "@/lib/customers/list";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

/** The merchant's own customers: its data, shown in full. */
export default async function MerchantCustomersPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const m = await requireMerchantPage();
  const page = parsePage(searchParams?.page);
  const filters = parseCustomerFilters(searchParams);
  const { rows, total } = await loadCustomers({ filters, sort: parseCustomerSort(undefined), page, pageSize: DEFAULT_PAGE_SIZE, mode: "full", merchantId: m.id });
  return <MerchantCustomersView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} q={filters.q} />;
}
