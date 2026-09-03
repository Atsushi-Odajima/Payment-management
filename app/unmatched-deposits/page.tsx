import { maskName } from "@/lib/pii/mask";
import { cookies } from "next/headers";
import { UnmatchedDepositsView } from "@/components/views/unmatched-deposits-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadUnmatchedDeposits, parseUnmatchedDepositFilters, parseUnmatchedDepositSort } from "@/lib/deposits/list";

export const dynamic = "force-dynamic";

export default async function UnmatchedDepositsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseUnmatchedDepositFilters(searchParams, mode);
  const sort = parseUnmatchedDepositSort(searchParams);
  const { rows, total, openCount } = await loadUnmatchedDeposits({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <UnmatchedDepositsView rows={rows.map((r) => ({ ...r, payerName: maskName(r.payerName) ?? "" }))} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} openCount={openCount} />;
}
