import { ok, withApiHandler } from "@/lib/api/handler";
import { CSV_MAX_ROWS, csvResponse, toCsv } from "@/lib/csv";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { piiCsvMode } from "@/lib/pii/csv";
import { maskName } from "@/lib/pii/mask";
import { loadDepositNotifications, loadDepositNotificationsForExport, parseDepositNotificationFilters, parseDepositNotificationSort } from "@/lib/deposits/notification-list";

/**
 * GET /api/deposit-notifications — the deposit notification log (Phase P1-1):
 * every bank / konbini notification received, with its result. Filters
 * source / result / from / to, mode from `?mode=` or the cookie; `?format=csv`.
 * Read-only like the other lists (permission deposit_notification.view = everyone).
 */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseDepositNotificationFilters(q, resolveMode(q.mode));
  const sort = parseDepositNotificationSort(q);
  if (q.format === "csv") {
    const raw = await loadDepositNotificationsForExport(filters, sort, CSV_MAX_ROWS);
    const mode = await piiCsvMode(req);
    const rows = mode === "full" ? raw : raw.map((r) => ({ ...r, payerName: r.payerName ? maskName(r.payerName) : null }));
    return csvResponse(
      toCsv(rows, [
        { header: "notificationNo", value: (r) => r.notificationNo },
        { header: "receivedRequestAt", value: (r) => r.createdAt },
        { header: "source", value: (r) => r.source },
        { header: "eventId", value: (r) => r.eventId ?? "" },
        { header: "mode", value: (r) => (r.livemode ? "live" : "test") },
        { header: "transferId", value: (r) => r.transferId ?? "" },
        { header: "receiptNo", value: (r) => r.cvsReceiptNo ?? "" },
        { header: "amount", value: (r) => r.amount },
        { header: "receivedAt", value: (r) => r.receivedAt },
        { header: "payerName", value: (r) => r.payerName ?? "" },
        { header: "bankReference", value: (r) => r.bankReference ?? "" },
        { header: "result", value: (r) => r.result },
        { header: "resultReason", value: (r) => r.resultReason ?? "" },
        { header: "paymentId", value: (r) => r.paymentId ?? "" },
        { header: "orderNumber", value: (r) => r.payment?.orderNumber ?? "" },
        { header: "unmatchedDepositId", value: (r) => r.unmatchedDepositId ?? "" },
      ]),
      "deposit-notifications.csv",
      filters.mode,
    );
  }
  const page = parsePage(q.page);
  const { rows, total } = await loadDepositNotifications({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ items: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});
