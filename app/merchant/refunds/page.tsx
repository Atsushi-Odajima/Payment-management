import { cookies } from "next/headers";
import { MerchantRefundsView } from "@/components/views/merchant/refunds-view";
import { requireMerchantPage } from "@/lib/merchant-portal/page-guard";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadRefunds, parseRefundSort } from "@/lib/refunds/list";

export const dynamic = "force-dynamic";

export default async function MerchantRefundsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const m = await requireMerchantPage();
  const page = parsePage(searchParams?.page);
  const result = await loadRefunds({ filters: { status: "", merchant: m.id, from: "", to: "", mode: modeFromCookieStore(cookies()) }, sort: parseRefundSort(undefined), page, pageSize: DEFAULT_PAGE_SIZE });
  return <MerchantRefundsView rows={result.rows} total={result.total} page={page} pageSize={DEFAULT_PAGE_SIZE} />;
}
