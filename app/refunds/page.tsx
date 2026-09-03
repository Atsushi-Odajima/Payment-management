import { cookies } from "next/headers";
import { RefundsView } from "@/components/views/refunds-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadRefunds, parseRefundFilters, parseRefundSort } from "@/lib/refunds/list";

export const dynamic = "force-dynamic";

export default async function RefundsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseRefundFilters(searchParams, mode);
  const sort = parseRefundSort(searchParams);
  const { rows, total, merchants, pendingCount } = await loadRefunds({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <RefundsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} pendingCount={pendingCount} />;
}
