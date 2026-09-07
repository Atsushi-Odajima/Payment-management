import { piiCsvMode } from "@/lib/pii/csv";
import { maskName } from "@/lib/pii/mask";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadUnmatchedDeposits, loadUnmatchedDepositsForExport, parseUnmatchedDepositFilters, parseUnmatchedDepositSort, toUnmatchedDepositRow } from "@/lib/deposits/list";
import { registerUnmatchedDeposit } from "@/lib/deposits/service";
import { unmatchedDepositInputSchema } from "@/lib/deposits/types";

/** GET /api/unmatched-deposits — deposits without a usable transfer id (mode from `?mode=` or the cookie); `?format=csv`. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseUnmatchedDepositFilters(q, resolveMode(q.mode));
  const sort = parseUnmatchedDepositSort(q);
  if (q.format === "csv") {
    const raw = await loadUnmatchedDepositsForExport(filters, sort, CSV_MAX_ROWS);
    const mode = await piiCsvMode(req);
    const rows = mode === "full" ? raw : raw.map((r) => ({ ...r, payerName: maskName(r.payerName) ?? "" }));
    return csvResponse(
      toCsv(rows, [
        { header: "id", value: (r) => r.id },
        { header: "receivedAt", value: (r) => r.receivedAt },
        { header: "payerName", value: (r) => r.payerName },
        { header: "amount", value: (r) => r.amount },
        { header: "givenTransferId", value: (r) => r.givenTransferId ?? "" },
        { header: "bankReference", value: (r) => r.bankReference ?? "" },
        { header: "source", value: (r) => r.source },
        { header: "status", value: (r) => r.status },
        { header: "reason", value: (r) => r.reason ?? "" },
        { header: "candidateOrderNumber", value: (r) => r.candidatePayment?.orderNumber ?? "" },
        { header: "matchedTransferId", value: (r) => r.matchedTransferId ?? "" },
        { header: "orderNumber", value: (r) => r.payment?.orderNumber ?? "" },
        { header: "merchantCode", value: (r) => r.payment?.merchant?.merchantCode ?? "" },
        { header: "matchedAt", value: (r) => r.matchedAt },
        { header: "dismissKind", value: (r) => r.dismissKind ?? "" },
        { header: "dismissReason", value: (r) => r.dismissReason ?? "" },
      ]),
      "unmatched-deposits.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, openCount } = await loadUnmatchedDeposits({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ items: rows, total, openCount, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/unmatched-deposits — support registers a deposit seen on the bank statement that carries no usable transfer id. */
export const POST = withApiHandler(async (req) => {
  await requirePermission(req, "unmatched_deposit", "register");
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = unmatchedDepositInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const row = await registerUnmatchedDeposit(prisma, { input: parsed.data, livemode: resolveMode(q.mode) === "live", source: "manual", audit: await auditContextFromRequest(req) });
  return ok(toUnmatchedDepositRow(row), { status: 201 });
});
