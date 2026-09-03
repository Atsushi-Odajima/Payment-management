import { CustomersView } from "@/components/views/customers-view";
import { loadAnonymizeBatches, loadCustomers, parseCustomerFilters, parseCustomerSort } from "@/lib/customers/list";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

/** Customer master (Phase M-1): masked personal data, filters, CSV; the batches tab lists anonymisation runs. */
export default async function CustomersPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseCustomerFilters(searchParams);
  const sort = parseCustomerSort(searchParams);
  const [{ rows, total, merchants }, batches] = await Promise.all([loadCustomers({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE, mode: "masked" }), loadAnonymizeBatches()]);
  return <CustomersView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} batches={batches} tab={searchParams?.tab === "batches" ? "batches" : "list"} />;
}
