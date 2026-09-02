import { TransactionsView } from "@/components/views/transactions-view";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { APPLICATION_STATUSES } from "@/lib/payments/transitions";

export const dynamic = "force-dynamic";

/** 決済申請一覧 — transactions that have not completed yet, transfers due soonest first. */
export default async function ApplicationsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseTransactionFilters(searchParams, APPLICATION_STATUSES);
  const result = await loadTransactions({
    allowedStatuses: APPLICATION_STATUSES,
    filters,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    order: "applications",
  });
  return (
    <TransactionsView
      kind="applications"
      items={result.items}
      total={result.total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      filters={result.filters}
      merchants={result.merchants}
      statuses={APPLICATION_STATUSES}
    />
  );
}
