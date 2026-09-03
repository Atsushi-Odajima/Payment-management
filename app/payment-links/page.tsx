import { cookies } from "next/headers";
import { PaymentLinksView } from "@/components/views/payment-links-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadPaymentLinks, parsePaymentLinkFilters, parsePaymentLinkSort } from "@/lib/payment-links/list";

export const dynamic = "force-dynamic";

export default async function PaymentLinksPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parsePaymentLinkFilters(searchParams, mode);
  const sort = parsePaymentLinkSort(searchParams);
  const { rows, total, merchants } = await loadPaymentLinks({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <PaymentLinksView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} />;
}
