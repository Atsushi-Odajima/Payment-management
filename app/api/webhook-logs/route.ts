import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadWebhookDeliveries, loadWebhookDeliveriesForExport, parseWebhookFilters, parseWebhookSort } from "@/lib/webhooks/list";

/** GET /api/webhook-logs — deliveries for the mode; `?format=csv` exports. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseWebhookFilters(q, resolveMode(q.mode));
  const sort = parseWebhookSort(q);
  if (q.format === "csv") {
    const rows = await loadWebhookDeliveriesForExport(filters, sort, CSV_MAX_ROWS);
    return csvResponse(
      toCsv(rows, [
        { header: "createdAt", value: (r) => r.createdAt },
        { header: "deliveryId", value: (r) => r.id },
        { header: "merchantCode", value: (r) => r.merchant.merchantCode },
        { header: "event", value: (r) => r.event },
        { header: "paymentId", value: (r) => r.paymentId },
        { header: "url", value: (r) => r.url },
        { header: "status", value: (r) => r.status },
        { header: "attempts", value: (r) => r.attempts },
        { header: "responseStatus", value: (r) => r.responseStatus },
        { header: "lastSentAt", value: (r) => r.lastSentAt },
        { header: "nextRetryAt", value: (r) => r.nextRetryAt },
      ]),
      "webhook-logs.csv",
    );
  }
  const page = parsePage(q.page);
  const { rows, total, failedCount } = await loadWebhookDeliveries({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ deliveries: rows, total, failedCount, page, pageSize: DEFAULT_PAGE_SIZE });
});
