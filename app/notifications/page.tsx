import { NotificationsView } from "@/components/views/notifications-view";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/page-guard";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadNotifications, parseNotificationFilters, parseNotificationSort } from "@/lib/notifications/list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const admin = await requireAdminPage();
  const page = parsePage(searchParams?.page);
  const filters = parseNotificationFilters(searchParams);
  const sort = parseNotificationSort(searchParams);
  const { rows, total, unread } = await loadNotifications(prisma, { admin, filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <NotificationsView rows={rows} total={total} unread={unread} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} />;
}
