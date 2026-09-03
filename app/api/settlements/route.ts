import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadSettlements, loadSettlementsForExport, parseSettlementFilters, parseSettlementSort } from "@/lib/settlements/list";

/** GET /api/settlements — batches for the mode; `?format=csv` exports the batch summary. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseSettlementFilters(q, resolveMode(q.mode));
  const sort = parseSettlementSort(q);
  if (q.format === "csv") {
    const rows = await loadSettlementsForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "batchId", value: (r) => r.id },
        { header: "merchantCode", value: (r) => r.merchant.merchantCode },
        { header: "periodFrom", value: (r) => r.periodFrom },
        { header: "periodTo", value: (r) => r.periodTo },
        { header: "grossAmount", value: (r) => r.grossAmount },
        { header: "feeAmount", value: (r) => r.feeAmount },
        { header: "refundAmount", value: (r) => r.refundAmount },
        { header: "chargebackAmount", value: (r) => r.chargebackAmount },
        { header: "settlementFee", value: (r) => r.settlementFee },
        { header: "netAmount", value: (r) => r.netAmount },
        { header: "status", value: (r) => r.status },
        { header: "scheduledAt", value: (r) => r.scheduledAt },
        { header: "paidAt", value: (r) => r.paidAt },
        { header: "lines", value: (r) => r.lineCount },
      ]),
      "settlements.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total } = await loadSettlements({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ settlements: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});
