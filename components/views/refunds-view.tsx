"use client";

// Refund management list (返金管理): requested rows first, filters by
// status / merchant / period; the test / live switch in the header picks the mode.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { RefundStatusBadge } from "@/components/refund-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { RefundFilters, RefundRow } from "@/lib/refunds/list";
import { REFUND_STATUSES } from "@/lib/refunds/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function RefundsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
  pendingCount,
}: {
  rows: RefundRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: RefundFilters;
  merchants: { id: string; merchantCode: string; siteName: string }[];
  pendingCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    status: filters.status || undefined,
    merchant: filters.merchant || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/refunds", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.status || filters.merchant || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  const columns: DataColumn<RefundRow>[] = [
    { key: "createdAt", header: t("refunds.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    {
      key: "payment",
      header: t("refunds.thPayment"),
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.orderNumber}</span>
          <span className="ml-1 font-mono text-[11px] text-slate-500">{r.paymentId}</span>
        </span>
      ),
    },
    { key: "merchant", header: t("refunds.thMerchant"), render: (r) => (r.merchant ? `${r.merchant.merchantCode} ${r.merchant.siteName}` : "—") },
    {
      key: "amount",
      header: t("refunds.thAmount"),
      sortable: true,
      align: "right",
      render: (r) => (
        <span className="tabular-nums">
          {formatYen(r.amount)}
          <span className="ml-1 text-[11px] text-slate-500">/ {formatYen(r.paymentAmount)}</span>
        </span>
      ),
    },
    { key: "kind", header: t("refunds.thKind"), render: (r) => t(`refundEnums.kind.${r.kind}` as MessageKey) },
    {
      key: "reason",
      header: t("refunds.thReason"),
      render: (r) => (
        <span>
          {t(`refundEnums.reason.${r.reasonCode}` as MessageKey)}
          {r.forced && <span className="badge ml-1 bg-rose-100 text-rose-800 ring-rose-200">{t("refunds.forcedBadge")}</span>}
        </span>
      ),
    },
    { key: "status", header: t("refunds.thStatus"), sortable: true, render: (r) => <RefundStatusBadge status={r.status} /> },
    { key: "requestedBy", header: t("refunds.thRequestedBy"), render: (r) => r.requestedBy?.name ?? <span className="text-slate-400">—</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("refunds.title")}
        description={t("refunds.description")}
        helpHref="/manual/refunds"
        actions={pendingCount > 0 ? <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("refunds.pendingCount", { count: pendingCount })}</span> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("refunds.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {REFUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`refundEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("refunds.filterMerchant")}</span>
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
          <span>{t("refunds.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("refunds.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/refunds" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("refunds.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/refunds/${r.id}`}
        rowClassName={(r) => (r.status === "requested" ? "bg-amber-50/40" : undefined)}
        basePath="/refunds"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/refunds?${csvQuery.toString()}`}
        emptyText={t("refunds.empty")}
        minWidth="min-w-[960px]"
      />
    </div>
  );
}
