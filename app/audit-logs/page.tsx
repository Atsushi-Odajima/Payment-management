import { AuditLogsView } from "@/components/views/audit-logs-view";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { loadAuditLogs, parseAuditFilters, parseAuditSort } from "@/lib/audit-list";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  await requireAdminPage();
  const page = parsePage(searchParams?.page);
  const filters = parseAuditFilters(searchParams);
  const sort = parseAuditSort(searchParams);
  const { rows, total, actors } = await loadAuditLogs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <AuditLogsView rows={rows} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} actors={actors} />;
}
