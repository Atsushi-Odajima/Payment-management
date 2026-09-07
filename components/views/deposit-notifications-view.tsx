"use client";

// Deposit notification log (入金通知ログ, Phase P1-1): every bank / konbini
// notification received, with what happened to it — applied, duplicate
// (idempotent re-send), unmatched (filed as an unmatched deposit) or rejected.
// Rows link to the transaction and to the unmatched deposit they produced.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { DEPOSIT_NOTIFICATION_RESULTS, DEPOSIT_NOTIFICATION_SOURCES, type DepositNotificationFilters, type DepositNotificationResult, type DepositNotificationRow } from "@/lib/deposits/notification-types";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { formatCvsReceiptNo } from "@/lib/payments/konbini";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

const RESULT_STYLE: Record<DepositNotificationResult, string> = {
  applied: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  duplicate: "bg-slate-100 text-slate-700 ring-slate-200",
  unmatched: "bg-amber-100 text-amber-800 ring-amber-200",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function DepositNotificationResultBadge({ result }: { result: DepositNotificationResult }) {
  const t = useT();
  return <span className={cn("badge", RESULT_STYLE[result])}>{t(`depositNotificationEnums.result.${result}` as MessageKey)}</span>;
}

export function DepositNotificationsView({ rows, total, page, pageSize, sort, filters }: { rows: DepositNotificationRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: DepositNotificationFilters }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    source: filters.source || undefined,
    result: filters.result || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/deposit-notifications", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.source || filters.result || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  const columns: DataColumn<DepositNotificationRow>[] = [
    { key: "createdAt", header: t("depositNotifications.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    { key: "no", header: t("depositNotifications.thNo"), render: (r) => <span className="font-mono text-xs text-slate-700">{r.notificationNo}</span> },
    { key: "source", header: t("depositNotifications.thSource"), render: (r) => <span className="text-xs">{t(`depositNotificationEnums.source.${r.source}` as MessageKey)}</span> },
    {
      key: "identifier",
      header: t("depositNotifications.thIdentifier"),
      render: (r) => <span className="font-mono text-xs">{r.transferId ?? (r.cvsReceiptNo ? formatCvsReceiptNo(r.cvsReceiptNo) : "—")}</span>,
    },
    { key: "amount", header: t("depositNotifications.thAmount"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.amount)}</span> },
    { key: "receivedAt", header: t("depositNotifications.thReceived"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.receivedAt)}</span> },
    { key: "payer", header: t("depositNotifications.thPayer"), render: (r) => <span className="text-xs text-slate-600">{r.payerName ?? "—"}{r.bankReference ? ` · ${r.bankReference}` : ""}</span> },
    {
      key: "result",
      header: t("depositNotifications.thResult"),
      sortable: true,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <DepositNotificationResultBadge result={r.result} />
          {r.resultReason && <span className="text-xs text-slate-500">{t(`depositNotificationEnums.reason.${r.resultReason}` as MessageKey)}</span>}
        </span>
      ),
    },
    {
      key: "target",
      header: t("depositNotifications.thTarget"),
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1 text-xs">
          {r.payment ? (
            <>
              <Link href={`/payments/${r.payment.id}`} className="font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                {r.payment.orderNumber}
              </Link>
              {isPaymentStatus(r.payment.status) && <PaymentStatusBadge status={r.payment.status} />}
            </>
          ) : null}
          {r.unmatchedDepositId && (
            <Link href={`/unmatched-deposits?highlight=${r.unmatchedDepositId}`} className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
              {t("depositNotifications.openUnmatched")}
            </Link>
          )}
          {!r.payment && !r.unmatchedDepositId && <span className="text-slate-400">—</span>}
        </span>
      ),
    },
    { key: "eventId", header: t("depositNotifications.thEventId"), render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.eventId ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("depositNotifications.title")} description={t("depositNotifications.description")} helpHref="/manual/applications" />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("depositNotifications.thSource")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.source} onChange={(e) => go({ source: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {DEPOSIT_NOTIFICATION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`depositNotificationEnums.source.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("depositNotifications.thResult")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.result} onChange={(e) => go({ result: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {DEPOSIT_NOTIFICATION_RESULTS.map((s) => (
              <option key={s} value={s}>
                {t(`depositNotificationEnums.result.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("depositNotifications.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("depositNotifications.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/deposit-notifications" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("depositNotifications.filterClear")}
          </Link>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.result === "rejected" ? "bg-rose-50/40" : r.result === "unmatched" ? "bg-amber-50/40" : undefined)}
        basePath="/deposit-notifications"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/deposit-notifications?${csvQuery.toString()}`}
        emptyText={t("depositNotifications.empty")}
        minWidth="min-w-[1180px]"
      />
      <p className="mt-4 text-xs text-slate-500">{t("depositNotifications.note")}</p>
    </div>
  );
}
