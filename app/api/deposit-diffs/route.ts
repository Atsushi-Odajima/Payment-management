import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadDepositDiffs, loadDepositDiffsForExport, parseDepositDiffFilters, parseDepositDiffSort } from "@/lib/risk/deposit-diffs";

/** GET /api/deposit-diffs — transactions with a short / excess deposit; `?format=csv`. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseDepositDiffFilters(q, resolveMode(q.mode));
  const sort = parseDepositDiffSort(q);
  if (q.format === "csv") {
    const rows = await loadDepositDiffsForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "paymentId", value: (r) => r.id },
        { header: "orderNumber", value: (r) => r.orderNumber },
        { header: "merchantCode", value: (r) => r.merchant?.merchantCode ?? "" },
        { header: "transferId", value: (r) => r.transferId },
        { header: "amount", value: (r) => r.amount },
        { header: "depositAmount", value: (r) => r.depositAmount },
        { header: "difference", value: (r) => r.difference },
        { header: "diff", value: (r) => r.diff },
        { header: "status", value: (r) => r.diffStatus },
        { header: "paymentStatus", value: (r) => r.paymentStatus },
        { header: "updatedAt", value: (r) => r.updatedAt },
      ]),
      "deposit-diffs.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, openCount } = await loadDepositDiffs({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ items: rows, total, openCount, page, pageSize: DEFAULT_PAGE_SIZE });
});
