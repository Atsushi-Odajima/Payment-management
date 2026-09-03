"use client";

// Short / excess deposits (Phase F-3): every transaction whose reconciliation
// left a difference, with its follow-up status and the operator actions.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { DepositDiffStatusBadge } from "@/components/risk-badges";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { DEPOSIT_DIFF_STATUSES, type DepositDiffAction, type DepositDiffFilters, type DepositDiffRow } from "@/lib/risk/deposit-diff-types";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

export function DepositDiffsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
  openCount,
}: {
  rows: DepositDiffRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: DepositDiffFilters;
  merchants: { id: string; merchantCode: string; siteName: string }[];
  openCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [busyId, setBusyId] = useState<string | null>(null);
  const params: QueryParams = {
    status: filters.status || undefined,
    diff: filters.diff || undefined,
    merchant: filters.merchant || undefined,
    sort: sort.key === "updatedAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "updatedAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/deposit-diffs", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.status || filters.diff || filters.merchant);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  async function run(row: DepositDiffRow, action: DepositDiffAction) {
    const ok = await confirm({
      title: t(`depositDiffs.actions.${action}` as MessageKey),
      body: t(`depositDiffs.confirm.${action}` as MessageKey, { orderNumber: row.orderNumber, amount: formatYen(Math.abs(row.difference)) }),
      confirmLabel: t(`depositDiffs.actions.${action}` as MessageKey),
    });
    if (!ok) return;
    setBusyId(row.id);
    const res = await apiJson(`/api/deposit-diffs/${row.id}/${action}`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t(`depositDiffs.done.${action}` as MessageKey));
    router.refresh();
  }

  const columns: DataColumn<DepositDiffRow>[] = [
    { key: "updatedAt", header: t("depositDiffs.thUpdated"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.updatedAt)}</span> },
    {
      key: "payment",
      header: t("depositDiffs.thPayment"),
      render: (r) => (
        <span>
          <Link href={`/applications/${r.id}`} className="font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.orderNumber}
          </Link>
          {r.transferId && <span className="ml-1 font-mono text-[11px] text-slate-500">{r.transferId}</span>}
        </span>
      ),
    },
    { key: "merchant", header: t("depositDiffs.thMerchant"), render: (r) => (r.merchant ? `${r.merchant.merchantCode} ${r.merchant.siteName}` : "—") },
    { key: "amount", header: t("depositDiffs.thAmount"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.amount)}</span> },
    { key: "deposit", header: t("depositDiffs.thDeposit"), align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.depositAmount)}</span> },
    {
      key: "difference",
      header: t("depositDiffs.thDifference"),
      align: "right",
      render: (r) => (
        <span className={cn("font-semibold tabular-nums", r.difference < 0 ? "text-rose-700" : "text-amber-700")}>
          {r.difference < 0 ? "−" : "+"}
          {formatYen(Math.abs(r.difference))}
          <span className="ml-1 text-[11px] font-normal">{t(`paymentDetail.diff_${r.diff}` as MessageKey)}</span>
        </span>
      ),
    },
    { key: "paymentStatus", header: t("depositDiffs.thPaymentStatus"), render: (r) => (isPaymentStatus(r.paymentStatus) ? <PaymentStatusBadge status={r.paymentStatus} /> : r.paymentStatus) },
    { key: "depositDiffStatus", header: t("depositDiffs.thStatus"), sortable: true, render: (r) => <DepositDiffStatusBadge status={r.diffStatus} /> },
    {
      key: "actions",
      header: t("depositDiffs.thActions"),
      render: (r) => (
        <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {r.diffStatus === "open" && r.diff === "excess" && (
            <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={busyId === r.id} onClick={() => run(r, "refund")}>
              {t("depositDiffs.actions.refund")}
            </button>
          )}
          {r.diffStatus === "open" && r.diff === "short" && (
            <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={busyId === r.id} onClick={() => run(r, "notify")}>
              {t("depositDiffs.actions.notify")}
            </button>
          )}
          {r.diffStatus !== "resolved" && (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busyId === r.id} onClick={() => run(r, "resolve")}>
              {t("depositDiffs.actions.resolve")}
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("depositDiffs.title")}
        description={t("depositDiffs.description")}
        helpHref="/manual/risk"
        actions={openCount > 0 ? <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{t("depositDiffs.openCount", { count: openCount })}</span> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("depositDiffs.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {DEPOSIT_DIFF_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`depositDiffEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("depositDiffs.filterDiff")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.diff} onChange={(e) => go({ diff: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            <option value="short">{t("paymentDetail.diff_short")}</option>
            <option value="excess">{t("paymentDetail.diff_excess")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("depositDiffs.filterMerchant")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.merchant} onChange={(e) => go({ merchant: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </label>
        {hasFilter && (
          <Link href="/deposit-diffs" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("depositDiffs.filterClear")}
          </Link>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.diffStatus === "open" ? "bg-rose-50/30" : undefined)}
        basePath="/deposit-diffs"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/deposit-diffs?${csvQuery.toString()}`}
        emptyText={t("depositDiffs.empty")}
        minWidth="min-w-[1100px]"
      />
    </div>
  );
}
