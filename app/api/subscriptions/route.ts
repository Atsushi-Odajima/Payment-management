import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadSubscriptions, parseSubscriptionFilters, parseSubscriptionSort, toSubscriptionRow } from "@/lib/subscriptions/list";
import { createSubscription } from "@/lib/subscriptions/service";
import { subscriptionInputSchema } from "@/lib/subscriptions/types";

/** GET /api/subscriptions — subscriptions for the mode; `?format=csv` exports. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseSubscriptionFilters(q, resolveMode(q.mode));
  const sort = parseSubscriptionSort(q);
  if (q.format === "csv") {
    const { rows } = await loadSubscriptions({ filters, sort, page: 1, pageSize: CSV_MAX_ROWS });
    return csvResponse(
      toCsv(rows, [
        { header: "subscriptionId", value: (r) => r.id },
        { header: "merchantCode", value: (r) => r.merchant.merchantCode },
        { header: "plan", value: (r) => r.plan.name },
        { header: "amount", value: (r) => r.plan.amount },
        { header: "interval", value: (r) => r.plan.interval },
        { header: "customerId", value: (r) => r.customerId },
        { header: "customerName", value: (r) => r.customerName },
        { header: "status", value: (r) => r.status },
        { header: "nextChargeAt", value: (r) => r.nextChargeAt },
        { header: "failCount", value: (r) => r.failCount },
        { header: "startedAt", value: (r) => r.startedAt },
      ]),
      "subscriptions.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, pastDueCount } = await loadSubscriptions({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ subscriptions: rows, total, pastDueCount, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/subscriptions — start a subscription (mode from `?mode=` or the cookie). */
export const POST = withApiHandler(async (req) => {
  await requirePermission(req, "subscription", "create");
  const parsed = subscriptionInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const modeParam = new URL(req.url).searchParams.get("mode");
  const cookieMode = req.headers.get("cookie")?.match(/(?:^|;\s*)wirepay\.mode=(test|live)/)?.[1];
  const row = await createSubscription(prisma, { input: parsed.data, livemode: resolveMode(modeParam ?? cookieMode) === "live", audit: await auditContextFromRequest(req) });
  return ok(toSubscriptionRow(row), { status: 201 });
});
