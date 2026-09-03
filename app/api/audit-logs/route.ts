import { ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { loadAuditLogs, loadAuditLogsForExport, parseAuditFilters, parseAuditSort } from "@/lib/audit-list";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";

/** GET /api/audit-logs — filtered audit rows; `?format=csv` exports up to CSV_MAX_ROWS. */
export const GET = withApiHandler(async (req) => {
  await requireAdmin(req);
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseAuditFilters(q);
  const sort = parseAuditSort(q);
  if (q.format === "csv") {
    const rows = await loadAuditLogsForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "actorType", value: (r) => r.actorType },
        { header: "actor", value: (r) => r.actor?.loginId ?? "" },
        { header: "action", value: (r) => r.action },
        { header: "targetType", value: (r) => r.targetType },
        { header: "targetId", value: (r) => r.targetId },
        { header: "ip", value: (r) => r.ip },
        { header: "before", value: (r) => r.before },
        { header: "after", value: (r) => r.after },
      ]),
      "audit-logs.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total } = await loadAuditLogs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ logs: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});
