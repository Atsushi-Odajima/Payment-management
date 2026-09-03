"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { useAuditLabels } from "@/components/audit-labels";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import type { AuditFilters, AuditRow } from "@/lib/audit-list";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";

export function AuditLogsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  actors,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: AuditFilters;
  actors: { id: string; loginId: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const labels = useAuditLabels();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    actor: filters.actor || undefined,
    action: filters.action || undefined,
    targetType: filters.targetType || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/audit-logs", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.actor || filters.action || filters.targetType || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("format", "csv");

  const columns: DataColumn<AuditRow>[] = [
    { key: "createdAt", header: t("audit.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    {
      key: "actor",
      header: t("audit.thActor"),
      render: (r) =>
        r.actor ? (
          <span>
            <span className="font-medium text-slate-900">{r.actor.name}</span>
            <span className="ml-1 font-mono text-xs text-slate-500">{r.actor.loginId}</span>
          </span>
        ) : r.merchant ? (
          <span>
            <span className="badge bg-sky-100 text-sky-800 ring-sky-200">{labels.actorType(r.actorType)}</span>
            <span className="ml-1 font-mono text-xs text-slate-500">{r.merchant.merchantCode}</span>
          </span>
        ) : (
          <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{labels.actorType(r.actorType)}</span>
        ),
    },
    { key: "action", header: t("audit.thAction"), sortable: true, render: (r) => <span className="text-slate-900">{labels.action(r.action)}</span> },
    {
      key: "targetType",
      header: t("audit.thTarget"),
      sortable: true,
      render: (r) => (
        <span>
          {labels.targetType(r.targetType)}
          {r.targetId && <span className="ml-1 font-mono text-xs text-slate-500">{r.targetId}</span>}
        </span>
      ),
    },
    { key: "ip", header: t("audit.thIp"), render: (r) => <span className="font-mono text-xs text-slate-500">{r.ip ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("audit.title")} description={t("audit.description")} helpHref="/manual/admins" />

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("audit.filterActor")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.actor} onChange={(e) => go({ actor: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.loginId})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("audit.filterAction")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.action} onChange={(e) => go({ action: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {labels.action(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("audit.filterTargetType")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.targetType} onChange={(e) => go({ targetType: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {AUDIT_TARGET_TYPES.map((x) => (
              <option key={x} value={x}>
                {labels.targetType(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("audit.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("audit.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/audit-logs" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("audit.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/audit-logs/${r.id}`}
        basePath="/audit-logs"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/audit-logs?${csvQuery.toString()}`}
        emptyText={t("audit.empty")}
      />
    </div>
  );
}
