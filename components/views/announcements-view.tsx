"use client";

// Announcement list (Phase G-3): notices / maintenance / incidents with
// status, window and audience.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { AnnouncementKindBadge, AnnouncementStatusBadge } from "@/components/announcement-banner";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AnnouncementFilters, AnnouncementRow } from "@/lib/announcements/list";
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_STATUSES } from "@/lib/announcements/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";

export function AnnouncementsView({ rows, total, page, pageSize, sort, filters }: { rows: AnnouncementRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: AnnouncementFilters }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    kind: filters.kind || undefined,
    status: filters.status || undefined,
    sort: sort.key === "publishFrom" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "publishFrom" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/announcements", params, { ...next, page: undefined }));

  const columns: DataColumn<AnnouncementRow>[] = [
    { key: "kind", header: t("announcements.thKind"), sortable: true, render: (r) => <AnnouncementKindBadge kind={r.kind} /> },
    {
      key: "title",
      header: t("announcements.thTitle"),
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.title}</span>
          {r.active && <span className="badge ml-2 bg-emerald-100 text-emerald-800 ring-emerald-200">{t("announcements.activeBadge")}</span>}
        </span>
      ),
    },
    { key: "status", header: t("announcements.thStatus"), sortable: true, render: (r) => <AnnouncementStatusBadge status={r.status} /> },
    { key: "publishFrom", header: t("announcements.thWindow"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.publishFrom)} – {r.publishUntil ? formatDate(r.publishUntil) : "∞"}</span> },
    { key: "audience", header: t("announcements.thAudience"), render: (r) => (r.targetAll ? t("announcements.audienceAll") : t("announcements.audienceSome", { count: r.targetMerchantIds.length })) },
    { key: "updates", header: t("announcements.thUpdates"), align: "right", render: (r) => <span className="tabular-nums text-xs text-slate-600">{r.updates.length}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("announcements.title")}
        description={t("announcements.description")}
        helpHref="/manual/announcements"
        actions={
          <Link href="/announcements/new" className="btn-primary">
            {t("announcements.create")}
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("announcements.thKind")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.kind} onChange={(e) => go({ kind: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {ANNOUNCEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`announcementEnums.kind.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("announcements.thStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {ANNOUNCEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`announcementEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        {(filters.kind || filters.status) && (
          <Link href="/announcements" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("announcements.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/announcements/${r.id}`} basePath="/announcements" params={params} sort={sort} total={total} page={page} pageSize={pageSize} emptyText={t("announcements.empty")} />
    </div>
  );
}
