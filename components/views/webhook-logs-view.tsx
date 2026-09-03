"use client";

// Webhook delivery log (Webhook送信ログ): failed / abandoned first, filters by
// merchant / event / status / period, CSV export.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { HttpStatusBadge, WebhookStatusBadge } from "@/components/webhook-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { WebhookFilters, WebhookRow } from "@/lib/webhooks/list";
import { WEBHOOK_STATUSES } from "@/lib/webhooks/status";
import { MERCHANT_WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";

export function WebhookLogsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
  failedCount,
}: {
  rows: WebhookRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: WebhookFilters;
  merchants: { id: string; merchantCode: string; siteName: string }[];
  failedCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    merchant: filters.merchant || undefined,
    event: filters.event || undefined,
    status: filters.status || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/webhook-logs", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.merchant || filters.event || filters.status || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  const columns: DataColumn<WebhookRow>[] = [
    { key: "createdAt", header: t("webhookLogs.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    { key: "merchant", header: t("webhookLogs.thMerchant"), render: (r) => `${r.merchant.merchantCode} ${r.merchant.siteName}` },
    { key: "event", header: t("webhookLogs.thEvent"), render: (r) => <span className="font-mono text-xs">{r.event}</span> },
    { key: "url", header: t("webhookLogs.thUrl"), render: (r) => <span className="block max-w-[260px] truncate font-mono text-[11px] text-slate-500">{r.url}</span> },
    { key: "status", header: t("webhookLogs.thStatus"), sortable: true, render: (r) => <WebhookStatusBadge status={r.status} /> },
    { key: "responseStatus", header: t("webhookLogs.thResponse"), render: (r) => <HttpStatusBadge status={r.responseStatus} /> },
    { key: "attempts", header: t("webhookLogs.thAttempts"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{r.attempts}</span> },
    {
      key: "lastSentAt",
      header: t("webhookLogs.thNext"),
      sortable: true,
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-slate-600">
          {r.status === "retrying" && r.nextRetryAt ? formatDate(r.nextRetryAt) : r.lastSentAt ? formatDate(r.lastSentAt) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("webhookLogs.title")}
        description={t("webhookLogs.description")}
        helpHref="/manual/webhooks"
        actions={failedCount > 0 ? <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{t("webhookLogs.failedCount", { count: failedCount })}</span> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("webhookLogs.filterMerchant")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.merchant} onChange={(e) => go({ merchant: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("webhookLogs.filterEvent")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.event} onChange={(e) => go({ event: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {MERCHANT_WEBHOOK_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("webhookLogs.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {WEBHOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`webhookEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("webhookLogs.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("webhookLogs.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/webhook-logs" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("webhookLogs.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/webhook-logs/${r.id}`}
        rowClassName={(r) => (r.status === "failed" || r.status === "abandoned" ? "bg-rose-50/40" : undefined)}
        basePath="/webhook-logs"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/webhook-logs?${csvQuery.toString()}`}
        emptyText={t("webhookLogs.empty")}
        minWidth="min-w-[1000px]"
      />
    </div>
  );
}
