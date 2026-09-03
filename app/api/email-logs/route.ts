import { piiCsvMode } from "@/lib/pii/csv";
import { maskEmail } from "@/lib/pii/mask";
import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadEmailLogs, loadEmailLogsForExport, parseEmailLogFilters, parseEmailLogSort } from "@/lib/email/list";

/** GET /api/email-logs — emails the system produced; `?format=csv` exports. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseEmailLogFilters(q);
  const sort = parseEmailLogSort(q);
  if (q.format === "csv") {
    const raw = await loadEmailLogsForExport(filters, sort, CSV_MAX_ROWS);
    const mode = await piiCsvMode(req);
    const rows = mode === "full" ? raw : raw.map((r) => ({ ...r, to: maskEmail(r.to) ?? "" }));
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "to", value: (r) => r.to },
        { header: "templateKey", value: (r) => r.templateKey },
        { header: "lang", value: (r) => r.lang },
        { header: "subject", value: (r) => r.subject },
        { header: "status", value: (r) => r.status },
        { header: "provider", value: (r) => r.provider },
        { header: "paymentId", value: (r) => r.paymentId },
        { header: "error", value: (r) => r.error },
      ]),
      "email-logs.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total } = await loadEmailLogs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ logs: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});
