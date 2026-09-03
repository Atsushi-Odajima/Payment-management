"use client";

// Chargeback list (Phase F-1): open cases first, nearest dispute deadline first.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { ChargebackStatusBadge } from "@/components/risk-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { ChargebackFilters, ChargebackRow } from "@/lib/chargebacks/list";
import { CHARGEBACK_STATUSES } from "@/lib/chargebacks/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

export function ChargebacksView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
  openCount,
}: {
  rows: ChargebackRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: ChargebackFilters;
  merchants: { id: string; merchantCode: string; siteName: string }[];
  openCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const now = Date.now();
  const params: QueryParams = {
    status: filters.status || undefined,
    merchant: filters.merchant || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "disputeDeadlineAt" && sort.dir === "asc" ? undefined : sort.key,
    dir: sort.key === "disputeDeadlineAt" && sort.dir === "asc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/chargebacks", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.status || filters.merchant || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");
  const deadlineSoon = (r: ChargebackRow) => (r.status === "received" || r.status === "disputed") && r.disputeDeadlineAt !== null && r.disputeDeadlineAt.getTime() - now < 3 * 86_400_000;

  const columns: DataColumn<ChargebackRow>[] = [
    {
      key: "disputeDeadlineAt",
      header: t("chargebacks.thDeadline"),
      sortable: true,
      render: (r) => <span className={cn("whitespace-nowrap text-xs", deadlineSoon(r) ? "font-semibold text-rose-700" : "text-slate-600")}>{r.disputeDeadlineAt ? formatDate(r.disputeDeadlineAt).slice(0, 10) : "—"}</span>,
    },
    { key: "occurredAt", header: t("chargebacks.thOccurred"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.occurredAt)}</span> },
    { key: "payment", header: t("chargebacks.thPayment"), render: (r) => <span className="font-medium text-slate-900">{r.orderNumber}</span> },
    { key: "merchant", header: t("chargebacks.thMerchant"), render: (r) => (r.merchant ? `${r.merchant.merchantCode} ${r.merchant.siteName}` : "—") },
    { key: "amount", header: t("chargebacks.thAmount"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.amount)}</span> },
    { key: "reason", header: t("chargebacks.thReason"), render: (r) => t(`chargebackEnums.reason.${r.reasonCode}` as MessageKey) },
    { key: "status", header: t("chargebacks.thStatus"), sortable: true, render: (r) => <ChargebackStatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={t("chargebacks.title")}
        description={t("chargebacks.description")}
        helpHref="/manual/risk"
        actions={
          <>
            {openCount > 0 && <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("chargebacks.openCount", { count: openCount })}</span>}
            <Link href="/chargebacks/new" className="btn-primary">
              {t("chargebacks.register")}
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("chargebacks.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {CHARGEBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`chargebackEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("chargebacks.filterMerchant")}</span>
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
          <span>{t("chargebacks.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("chargebacks.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/chargebacks" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("chargebacks.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/chargebacks/${r.id}`}
        rowClassName={(r) => (deadlineSoon(r) ? "bg-rose-50/40" : undefined)}
        basePath="/chargebacks"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/chargebacks?${csvQuery.toString()}`}
        emptyText={t("chargebacks.empty")}
      />
    </div>
  );
}
