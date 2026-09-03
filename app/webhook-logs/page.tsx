import { cookies } from "next/headers";
import { WebhookLogsView } from "@/components/views/webhook-logs-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadWebhookDeliveries, parseWebhookFilters, parseWebhookSort } from "@/lib/webhooks/list";

export const dynamic = "force-dynamic";

export default async function WebhookLogsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseWebhookFilters(searchParams, mode);
  const sort = parseWebhookSort(searchParams);
  const { rows, total, merchants, failedCount } = await loadWebhookDeliveries({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <WebhookLogsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} merchants={merchants} failedCount={failedCount} />;
}
