import { cookies } from "next/headers";
import { MerchantTransactionsView } from "@/components/views/merchant/transactions-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadTransactions, parseTransactionFilters } from "@/lib/payments/list";
import { PAYMENT_STATUSES } from "@/lib/payments/transitions";

export const dynamic = "force-dynamic";

export default async function MerchantTransactionsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const m = await requireMerchantPage();
  const page = parsePage(searchParams?.page);
  const filters = { ...parseTransactionFilters(searchParams, PAYMENT_STATUSES, modeFromCookieStore(cookies())), merchant: m.id };
  const result = await loadTransactions({ allowedStatuses: PAYMENT_STATUSES, filters, page, pageSize: DEFAULT_PAGE_SIZE, order: "sales" });
  return <MerchantTransactionsView items={result.items} total={result.total} page={page} pageSize={DEFAULT_PAGE_SIZE} status={filters.status} />;
}
