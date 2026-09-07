import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadChargebacks, loadChargebacksForExport, parseChargebackFilters, parseChargebackSort } from "@/lib/chargebacks/list";
import { createChargeback } from "@/lib/chargebacks/service";
import { chargebackCreateSchema } from "@/lib/chargebacks/types";

/** GET /api/chargebacks — cases for the mode (open first, nearest deadline first); `?format=csv`. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseChargebackFilters(q, resolveMode(q.mode));
  const sort = parseChargebackSort(q);
  if (q.format === "csv") {
    const rows = await loadChargebacksForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "occurredAt", value: (r) => r.occurredAt },
        { header: "chargebackId", value: (r) => r.id },
        { header: "paymentId", value: (r) => r.paymentId },
        { header: "orderNumber", value: (r) => r.orderNumber },
        { header: "merchantCode", value: (r) => r.merchant?.merchantCode ?? "" },
        { header: "amount", value: (r) => r.amount },
        { header: "reasonCode", value: (r) => r.reasonCode },
        { header: "status", value: (r) => r.status },
        { header: "disputeDeadlineAt", value: (r) => r.disputeDeadlineAt },
        { header: "resolvedAt", value: (r) => r.resolvedAt },
      ]),
      "chargebacks.csv",
      filters.mode,
    );
  }
  const page = parsePage(q.page);
  const { rows, total, openCount } = await loadChargebacks({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ chargebacks: rows, total, openCount, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/chargebacks — register a chargeback on a completed transaction (master). */
export const POST = withApiHandler(async (req) => {
  await requirePermission(req, "chargeback", "create");
  const parsed = chargebackCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await createChargeback(prisma, { input: parsed.data, audit: await auditContextFromRequest(req) });
  return ok(row, { status: 201 });
});
