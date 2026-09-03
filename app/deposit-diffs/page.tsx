import { cookies } from "next/headers";
import { DepositDiffsView } from "@/components/views/deposit-diffs-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadDepositDiffs, parseDepositDiffFilters, parseDepositDiffSort } from "@/lib/risk/deposit-diffs";

export const dynamic = "force-dynamic";

export default async function DepositDiffsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseDepositDiffFilters(searchParams, mode);
  const sort = parseDepositDiffSort(searchParams);
  const { rows, total, merchants, openCount } = await loadDepositDiffs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <DepositDiffsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} openCount={openCount} />;
}
