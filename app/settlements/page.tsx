import { cookies } from "next/headers";
import { SettlementsView } from "@/components/views/settlements-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadSettlements, parseSettlementFilters, parseSettlementSort } from "@/lib/settlements/list";

export const dynamic = "force-dynamic";

export default async function SettlementsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseSettlementFilters(searchParams, mode);
  const sort = parseSettlementSort(searchParams);
  const { rows, total, merchants } = await loadSettlements({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <SettlementsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} />;
}
