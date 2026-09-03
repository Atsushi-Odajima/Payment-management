import { cookies } from "next/headers";
import { ChargebacksView } from "@/components/views/chargebacks-view";
import { loadChargebacks, parseChargebackFilters, parseChargebackSort } from "@/lib/chargebacks/list";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function ChargebacksPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseChargebackFilters(searchParams, mode);
  const sort = parseChargebackSort(searchParams);
  const { rows, total, merchants, openCount } = await loadChargebacks({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <ChargebacksView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} openCount={openCount} />;
}
