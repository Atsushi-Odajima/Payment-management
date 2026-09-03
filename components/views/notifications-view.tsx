"use client";

// Notification centre list (Phase J): filters by kind / severity / read
// state / period, "mark all read", and a link to the per-admin settings.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { SeverityBadge } from "@/components/notification-bell";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { NOTIFICATION_KINDS, NOTIFICATION_SEVERITIES, type NotificationFilters, type NotificationRow } from "@/lib/notifications/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function NotificationsView({ rows, total, unread, page, pageSize, sort, filters }: { rows: NotificationRow[]; total: number; unread: number; page: number; pageSize: number; sort: SortState; filters: NotificationFilters }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState(false);
  const params: QueryParams = {
    kind: filters.kind || undefined,
    severity: filters.severity || undefined,
    read: filters.read || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/notifications", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.kind || filters.severity || filters.read || filters.from || filters.to);

  async function readAll() {
    setBusy(true);
    const res = await apiJson("/api/notifications/read-all", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("notifications.allRead"));
    router.refresh();
  }

  async function open(n: NotificationRow) {
    if (!n.readAt) await apiJson(`/api/notifications/${n.id}/read`, { method: "POST" });
    if (n.href) router.push(n.href);
    else router.refresh();
  }

  const columns: DataColumn<NotificationRow>[] = [
    { key: "read", header: "", render: (r) => <span className={cn("inline-block h-2.5 w-2.5 rounded-full", r.readAt ? "bg-slate-200" : "bg-brand-600")} aria-label={r.readAt ? t("notifications.read") : t("notifications.unread")} /> },
    { key: "severity", header: t("notifications.thSeverity"), sortable: true, render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: "kind", header: t("notifications.thKind"), sortable: true, render: (r) => <span className="text-xs text-slate-600">{t(`notificationEnums.kind.${r.kind.replace(".", "_")}` as MessageKey)}</span> },
    {
      key: "title",
      header: t("notifications.thTitle"),
      render: (r) => (
        <button type="button" className="text-left" onClick={() => open(r)}>
          <span className={cn("block", r.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>{r.title}</span>
          <span className="block max-w-[520px] truncate text-xs text-slate-500">{r.body}</span>
        </button>
      ),
    },
    { key: "createdAt", header: t("notifications.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
        helpHref="/manual/notifications"
        actions={
          <>
            <Link href="/notifications/settings" className="btn-secondary">
              {t("notifications.settingsLink")}
            </Link>
            <button type="button" className="btn-primary" disabled={busy || unread === 0} onClick={readAll}>
              {t("notifications.markAllRead")}
            </button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <span className="badge bg-brand-100 text-brand-800 ring-brand-200">{t("notifications.unreadCount", { count: unread })}</span>
        <label className="flex flex-col gap-1">
          <span>{t("notifications.thKind")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.kind} onChange={(e) => go({ kind: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {NOTIFICATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`notificationEnums.kind.${k.replace(".", "_")}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("notifications.thSeverity")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.severity} onChange={(e) => go({ severity: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {NOTIFICATION_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`notificationEnums.severity.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("notifications.filterRead")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.read} onChange={(e) => go({ read: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            <option value="unread">{t("notifications.unread")}</option>
            <option value="read">{t("notifications.read")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("notifications.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("notifications.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/notifications" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("notifications.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} basePath="/notifications" params={params} sort={sort} total={total} page={page} pageSize={pageSize} emptyText={t("notifications.empty")} minWidth="min-w-[860px]" />
    </div>
  );
}
