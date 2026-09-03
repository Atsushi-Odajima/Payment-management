"use client";

// Customer master (Phase M-1 / M-2): masked list with filters and CSV, plus
// the anonymisation runs (retention job / manual) on a second tab.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AnonymizeBatchRow, CustomerFilters, CustomerRow } from "@/lib/customers/list";
import type { MessageKey } from "@/lib/i18n";
import { buildHref, type SortState } from "@/lib/query";
import { cn } from "@/lib/utils";

export function CustomersView({ rows, total, page, pageSize, sort, filters, merchants, batches, tab }: { rows: CustomerRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: CustomerFilters; merchants: Array<{ id: string; merchantCode: string; siteName: string }>; batches: AnonymizeBatchRow[]; tab: "list" | "batches" }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params = { merchant: filters.merchant || undefined, q: filters.q || undefined, anonymized: filters.anonymized || undefined, sort: `${sort.key}:${sort.dir}` };
  const go = (next: Record<string, string | undefined>) => router.push(buildHref("/customers", params, next));

  const columns: DataColumn<CustomerRow>[] = [
    {
      key: "externalId",
      header: t("customers.thCustomer"),
      sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.name ?? "—"}</span>
          <span className="ml-1 font-mono text-xs text-slate-500">{r.externalId}</span>
          {r.anonymizedAt && <span className="badge ml-1 bg-slate-100 text-slate-600 ring-slate-200">{t("customers.anonymizedBadge")}</span>}
        </span>
      ),
    },
    { key: "email", header: t("customers.thEmail"), render: (r) => <span className="font-mono text-xs">{r.email ?? "—"}</span> },
    { key: "merchant", header: t("customers.thMerchant"), render: (r) => <span>{r.merchant.siteName}</span> },
    { key: "payments", header: t("customers.thPayments"), align: "right", render: (r) => <span className="tabular-nums">{r.paymentCount}</span> },
    { key: "tokens", header: t("customers.thTokens"), align: "right", render: (r) => <span className="tabular-nums">{r.tokenCount}</span> },
    { key: "lastPaymentAt", header: t("customers.thLastPayment"), render: (r) => <span className="text-xs text-slate-500">{r.lastPaymentAt ? formatDate(r.lastPaymentAt) : "—"}</span> },
    { key: "createdAt", header: t("customers.thCreated"), sortable: true, render: (r) => <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("customers.title")} description={t("customers.description")} helpHref="/manual/customers" />
      <div role="tablist" className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium">
        <Link role="tab" aria-selected={tab === "list"} href="/customers" className={cn("rounded-md px-3 py-1.5", tab === "list" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
          {t("customers.tabList")}
        </Link>
        <Link role="tab" aria-selected={tab === "batches"} href="/customers?tab=batches" className={cn("rounded-md px-3 py-1.5", tab === "batches" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
          {t("customers.tabBatches")}
        </Link>
      </div>
      {tab === "batches" ? (
        <div className="card overflow-hidden">
          {batches.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{t("customers.noBatches")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t("customers.thBatchAt")}</th>
                  <th className="px-5 py-3">{t("customers.thBatchKind")}</th>
                  <th className="px-5 py-3 text-right">{t("customers.thBatchCustomers")}</th>
                  <th className="px-5 py-3 text-right">{t("customers.thBatchPayments")}</th>
                  <th className="px-5 py-3 text-right">{t("customers.thBatchTokens")}</th>
                  <th className="px-5 py-3 text-right">{t("customers.thBatchAudit")}</th>
                  <th className="px-5 py-3">{t("customers.thBatchNote")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-600">{formatDate(b.startedAt)}</td>
                    <td className="px-5 py-2">{t(`customers.batchKind.${b.kind}` as MessageKey)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{b.customers}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{b.payments}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{b.tokens}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{b.auditLogs}</td>
                    <td className="px-5 py-2 text-xs text-slate-600">{b.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
            <label className="flex flex-col gap-1">
              <span>{t("customers.filterQ")}</span>
              <input className="input w-56 py-1.5 text-xs" defaultValue={filters.q} placeholder={t("customers.filterQPlaceholder")} onKeyDown={(e) => e.key === "Enter" && go({ q: (e.target as HTMLInputElement).value || undefined })} onBlur={(e) => e.target.value !== filters.q && go({ q: e.target.value || undefined })} />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("customers.filterMerchant")}</span>
              <select className="input w-auto py-1.5 text-xs" value={filters.merchant} onChange={(e) => go({ merchant: e.target.value || undefined })}>
                <option value="">{t("common.modeAll")}</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.merchantCode} — {m.siteName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("customers.filterAnonymized")}</span>
              <select className="input w-auto py-1.5 text-xs" value={filters.anonymized} onChange={(e) => go({ anonymized: e.target.value || undefined })}>
                <option value="">{t("common.modeAll")}</option>
                <option value="no">{t("customers.filterActive")}</option>
                <option value="yes">{t("customers.filterAnonymizedOnly")}</option>
              </select>
            </label>
          </div>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/customers/${r.id}`} basePath="/customers" params={params} sort={sort} total={total} page={page} pageSize={pageSize} csvHref={buildHref("/api/customers", params, { format: "csv" })} emptyText={t("customers.empty")} />
          <p className="mt-2 text-xs text-slate-500">{t("customers.maskNote")}</p>
        </>
      )}
    </div>
  );
}
