"use client";

// Payment links (Phase H-2): issued links for the mode with their usage.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { PaymentLinkStatusBadge } from "@/components/subscription-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { PaymentLinkFilters, PaymentLinkRow } from "@/lib/payment-links/list";
import { PAYMENT_LINK_STATUSES } from "@/lib/payment-links/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function PaymentLinksView({ rows, total, page, pageSize, sort, filters, merchants }: { rows: PaymentLinkRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: PaymentLinkFilters; merchants: { id: string; merchantCode: string; siteName: string }[] }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    status: filters.status || undefined,
    merchant: filters.merchant || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/payment-links", params, { ...next, page: undefined }));

  const columns: DataColumn<PaymentLinkRow>[] = [
    { key: "status", header: t("paymentLinks.thStatus"), sortable: true, render: (r) => <PaymentLinkStatusBadge status={r.status} unavailable={r.unavailable} /> },
    { key: "product", header: t("paymentLinks.thProduct"), render: (r) => <span className="font-medium text-slate-900">{r.productName}</span> },
    { key: "merchant", header: t("paymentLinks.thMerchant"), render: (r) => `${r.merchant.merchantCode} ${r.merchant.siteName}` },
    { key: "amount", header: t("paymentLinks.thAmount"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.amount)}</span> },
    { key: "usedCount", header: t("paymentLinks.thUses"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{r.usedCount}{r.maxUses ? ` / ${r.maxUses}` : ""}</span> },
    { key: "expiresAt", header: t("paymentLinks.thExpires"), render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{r.expiresAt ? formatDate(new Date(r.expiresAt.getTime() - 1)).slice(0, 10) : "—"}</span> },
    { key: "url", header: t("paymentLinks.thUrl"), render: (r) => <span className="font-mono text-[11px] text-slate-500">/pay/{r.token}</span> },
    { key: "createdAt", header: t("paymentLinks.thCreated"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("paymentLinks.title")}
        description={t("paymentLinks.description")}
        helpHref="/manual/payment-links"
        actions={
          <Link href="/payment-links/new" className="btn-primary">
            {t("paymentLinks.create")}
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("paymentLinks.thStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {PAYMENT_LINK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`paymentLinkEnums.state.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("paymentLinks.thMerchant")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.merchant} onChange={(e) => go({ merchant: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </label>
        {(filters.status || filters.merchant) && (
          <Link href="/payment-links" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("paymentLinks.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/payment-links/${r.id}`} basePath="/payment-links" params={params} sort={sort} total={total} page={page} pageSize={pageSize} emptyText={t("paymentLinks.empty")} minWidth="min-w-[960px]" />
    </div>
  );
}
