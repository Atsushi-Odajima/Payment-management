import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { buildReport, loadReportDetail, parseReportFilters } from "@/lib/reports/service";

/**
 * GET /api/reports — aggregated report for the filters.
 *   ?format=csv&kind=summary → one row per time bucket
 *   ?format=csv&kind=detail  → the period's transactions
 */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseReportFilters(q, resolveMode(q.mode));
  if (q.format === "csv" && q.kind === "detail") {
    const rows = await loadReportDetail(filters, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "paymentId", value: (r) => r.id },
        { header: "orderNumber", value: (r) => r.orderNumber },
        { header: "merchantCode", value: (r) => r.merchantCode },
        { header: "method", value: (r) => r.method },
        { header: "status", value: (r) => r.status },
        { header: "amount", value: (r) => r.amount },
        { header: "amountRefunded", value: (r) => r.amountRefunded },
      ]),
      `report-detail-${filters.from}-${filters.to}.csv`,
      filters.mode,
    );
  }
  const report = await buildReport(filters);
  if (q.format === "csv") {
    return csvResponse(
      toCsv(report.series, [
        { header: "bucket", value: (r) => r.bucket },
        { header: "applications", value: (r) => r.applications },
        { header: "completed", value: (r) => r.completed },
        { header: "amount", value: (r) => r.amount },
      ]),
      `report-summary-${filters.from}-${filters.to}.csv`,
      filters.mode,
    );
  }
  return ok(report);
});
