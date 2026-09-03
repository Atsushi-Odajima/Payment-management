import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadNotifications, parseNotificationFilters, parseNotificationSort } from "@/lib/notifications/list";

/** GET /api/notifications — the signed-in admin's notifications (role-scoped), filters kind / severity / read / from / to. */
export const GET = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const filters = parseNotificationFilters(q);
  const sort = parseNotificationSort(q);
  const page = parsePage(q.page);
  const { rows, total, unread } = await loadNotifications(prisma, { admin, filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ notifications: rows, total, unread, page, pageSize: DEFAULT_PAGE_SIZE });
});
