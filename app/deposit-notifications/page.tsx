import { cookies } from "next/headers";
import { DepositNotificationsView } from "@/components/views/deposit-notifications-view";
import { modeFromCookieStore } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { maskName } from "@/lib/pii/mask";
import { loadDepositNotifications, parseDepositNotificationFilters, parseDepositNotificationSort } from "@/lib/deposits/notification-list";

export const dynamic = "force-dynamic";

export default async function DepositNotificationsPage({ searchParams }: { searchParams?: Record<string, string | undefined> }) {
  const mode = modeFromCookieStore(cookies());
  const page = parsePage(searchParams?.page);
  const filters = parseDepositNotificationFilters(searchParams, mode);
  const sort = parseDepositNotificationSort(searchParams);
  const { rows, total } = await loadDepositNotifications({ filters, sort, page, pageSize: DEFAULT_PAGE_SIZE });
  return <DepositNotificationsView rows={rows.map((r) => ({ ...r, payerName: r.payerName ? maskName(r.payerName) : null }))} total={total} page={page} pageSize={DEFAULT_PAGE_SIZE} sort={sort} filters={filters} />;
}
