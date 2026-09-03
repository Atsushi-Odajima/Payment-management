import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadRefunds, loadRefundsForExport, parseRefundFilters, parseRefundSort } from "@/lib/refunds/list";
import { createRefundRequest } from "@/lib/refunds/service";
import { refundRequestSchema } from "@/lib/refunds/types";

/** GET /api/refunds — refund requests for the mode; `?format=csv` exports. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseRefundFilters(q, resolveMode(q.mode));
  const sort = parseRefundSort(q);
  if (q.format === "csv") {
    const rows = await loadRefundsForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "refundId", value: (r) => r.id },
        { header: "paymentId", value: (r) => r.paymentId },
        { header: "orderNumber", value: (r) => r.orderNumber },
        { header: "merchantCode", value: (r) => r.merchant?.merchantCode ?? "" },
        { header: "amount", value: (r) => r.amount },
        { header: "kind", value: (r) => r.kind },
        { header: "reasonCode", value: (r) => r.reasonCode },
        { header: "reason", value: (r) => r.reason },
        { header: "status", value: (r) => r.status },
        { header: "forced", value: (r) => r.forced },
        { header: "requestedBy", value: (r) => r.requestedBy?.loginId ?? "" },
        { header: "approvedBy", value: (r) => r.approvedBy?.loginId ?? "" },
        { header: "completedAt", value: (r) => r.completedAt },
      ]),
      "refunds.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, pendingCount } = await loadRefunds({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ refunds: rows, total, pendingCount, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/refunds — file a refund request (any signed-in operator). */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "refund", "request");
  const parsed = refundRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await createRefundRequest(prisma, { input: parsed.data, actor: { id: admin.id, role: admin.role }, audit: await auditContextFromRequest(req) });
  return ok(row, { status: 201 });
});
