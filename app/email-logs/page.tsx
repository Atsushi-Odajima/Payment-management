import { EmailLogsView } from "@/components/views/email-logs-view";
import { loadEmailLogs, parseEmailLogFilters, parseEmailLogSort } from "@/lib/email/list";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function EmailLogsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const page = parsePage(searchParams?.page);
  const filters = parseEmailLogFilters(searchParams);
  const sort = parseEmailLogSort(searchParams);
  const { rows, total } = await loadEmailLogs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <EmailLogsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} />;
}
