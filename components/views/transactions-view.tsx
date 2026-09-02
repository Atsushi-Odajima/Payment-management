"use client";

// One list component for both transaction screens:
//   kind = "applications" → 決済申請一覧 (not yet completed; transfers due soonest first)
//   kind = "sales"        → 決済一覧 (completed / refunded, with the sales summary)
// Same table, same filters (method / status / merchant / period / test-live).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ModeFilterChips } from "@/components/mode-filter";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { CATEGORIES, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments/methods";
import type { PaymentStatus } from "@/lib/payments/transitions";
import type { TransactionFilters, TransactionListItem, MerchantOption } from "@/lib/payments/list";
import { cn, formatYen } from "@/lib/utils";

export type TransactionListKind = "applications" | "sales";

export interface SalesStats {
  grossSales: number;
  refundsTotal: number;
  salesCount: number;
  todaySalesAmount: number;
  todaySalesCount: number;
}

export interface TransactionsViewProps {
  kind: TransactionListKind;
  items: TransactionListItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: TransactionFilters;
  merchants: MerchantOption[];
  statuses: readonly PaymentStatus[];
  stats?: SalesStats;
}

export function methodLabel(method: PaymentMethod, lang: "ja" | "en"): string {
  const c = CATEGORIES.find((x) => x.key === method);
  return c ? pickText(c.label, lang) : method;
}

export function TransactionsView(props: TransactionsViewProps) {
  const { kind, items, total, page, pageSize, filters, merchants, statuses, stats } = props;
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const basePath = kind === "applications" ? "/applications" : "/payments";

  const params: Record<string, string | undefined> = {
    status: filters.status || undefined,
    method: filters.method || undefined,
    merchant: filters.merchant || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    mode: filters.mode === "all" ? undefined : filters.mode,
  };
  const href = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...next })) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const go = (next: Record<string, string | undefined>) => router.push(href(next));
  const hasFilter = Boolean(filters.status || filters.method || filters.merchant || filters.from || filters.to);

  return (
    <div>
      <PageHeader
        title={kind === "applications" ? t("applications.title") : t("payments.title")}
        description={kind === "applications" ? t("applications.description") : t("payments.description")}
        helpHref={kind === "applications" ? "/manual/applications" : "/manual/payments"}
        actions={
          <>
            {kind === "sales" && (
              <Link href="/providers" className="btn-secondary">
                {t("payments.manageProviders")}
              </Link>
            )}
            <Link href="/payments/new" className="btn-primary">
              {t("payments.createPayment")}
            </Link>
          </>
        }
      />

      {stats && (
        <section className="mb-6 grid gap-4 sm:grid-cols-3" aria-label={t("payments.statsLabel")}>
          <Stat
            label={t("payments.statNetSales")}
            value={formatYen(stats.grossSales - stats.refundsTotal)}
            sub={t("payments.statNetSalesSub", {
              gross: formatYen(stats.grossSales),
              refunds: formatYen(stats.refundsTotal),
              count: stats.salesCount,
            })}
          />
          <Stat
            label={t("payments.statTodaySales")}
            value={formatYen(stats.todaySalesAmount)}
            sub={t("payments.statTodaySalesSub", { count: stats.todaySalesCount })}
          />
          <Stat label={t("payments.statShown")} value={t("payments.statShownValue", { shown: items.length, total })} sub={t("payments.statShownSub", { max: pageSize })} />
        </section>
      )}

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("transactions.filterStatus")} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <FilterLink href={href({ status: undefined })} active={!filters.status} label={t("common.modeAll")} />
            {statuses.map((s) => (
              <FilterLink key={s} href={href({ status: s })} active={filters.status === s} label={t(`status.${s}`)} />
            ))}
          </div>
          <ModeFilterChips basePath={basePath} current={filters.mode} params={{ ...params, mode: undefined }} />
        </div>
        <div className="flex flex-wrap items-end gap-3 text-xs text-slate-600">
          <label className="flex flex-col gap-1">
            <span>{t("transactions.filterMethod")}</span>
            <select className="input w-auto py-1.5 text-xs" value={filters.method} onChange={(e) => go({ method: e.target.value || undefined })}>
              <option value="">{t("common.modeAll")}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("transactions.filterMerchant")}</span>
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
            <span>{t("transactions.filterFrom")}</span>
            <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("transactions.filterTo")}</span>
            <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
          </label>
          {hasFilter && (
            <Link href={href({ status: undefined, method: undefined, merchant: undefined, from: undefined, to: undefined })} className="pb-2 text-xs font-medium text-brand-700 hover:underline">
              {t("transactions.filterClear")}
            </Link>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {total === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            {kind === "applications" ? t("applications.empty") : t("payments.empty")}
            <div className="mt-4">
              <Link href="/payments/new" className="btn-primary">
                {t("payments.emptyCta")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">{t("transactions.thTransaction")}</th>
                    <th scope="col" className="px-5 py-3">{t("transactions.thMerchant")}</th>
                    <th scope="col" className="px-5 py-3">{t("transactions.thProduct")}</th>
                    <th scope="col" className="px-5 py-3">{t("transactions.thCustomer")}</th>
                    <th scope="col" className="px-5 py-3">{t("transactions.thMethod")}</th>
                    <th scope="col" className="px-5 py-3 text-right">{t("transactions.thAmount")}</th>
                    <th scope="col" className="px-5 py-3">{t("transactions.thStatus")}</th>
                    <th scope="col" className="px-5 py-3">{kind === "applications" ? t("transactions.thAppliedAt") : t("transactions.thCompletedAt")}</th>
                    {kind === "applications" && <th scope="col" className="px-5 py-3">{t("transactions.thDue")}</th>}
                    <th scope="col" className="px-5 py-3">
                      <span className="sr-only">{t("transactions.thActions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((p) => {
                    const def = getProviderDefinition(p.providerKey);
                    const detail = `${basePath}/${p.id}`;
                    return (
                      <tr key={p.id} className={cn("hover:bg-slate-50/60", p.overdue && "bg-rose-50/60")}>
                        <td className="px-5 py-3">
                          <Link href={detail} className="font-medium text-slate-900 hover:text-brand-700">
                            {p.orderNumber}
                          </Link>
                          <p className="font-mono text-xs text-slate-500">
                            {p.transferId ? t("transactions.transferIdValue", { id: p.transferId }) : (p.externalId ?? p.id)}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          {p.merchant ? (
                            <>
                              <p className="text-slate-900">{p.merchant.siteName}</p>
                              <p className="font-mono text-xs text-slate-500">{p.merchant.merchantCode}</p>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-700">{p.productName ?? "—"}</td>
                        <td className="px-5 py-3 text-slate-700">
                          {p.customerName ?? "—"}
                          {p.customerId && <p className="font-mono text-xs text-slate-500">{p.customerId}</p>}
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          <span className="flex items-center gap-1.5">
                            {methodLabel(p.method, lang)}
                            {!p.livemode && (
                              <span className="whitespace-nowrap rounded bg-amber-50 px-1 text-[10px] text-amber-700">{t("common.test")}</span>
                            )}
                          </span>
                          <p className="text-xs text-slate-500">{def ? pickText(def.name, lang) : p.providerDisplayName}</p>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">
                          {formatYen(p.amount)}
                          {p.amountRefunded > 0 && <p className="text-xs font-normal text-purple-700">−{formatYen(p.amountRefunded)}</p>}
                          {p.depositDiff === "short" && p.depositAmount != null && (
                            <p className="text-xs font-normal text-rose-700">{t("transactions.depositShort", { amount: formatYen(p.depositAmount) })}</p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="flex flex-wrap items-center gap-1">
                            <PaymentStatusBadge status={p.status} />
                            {p.overdue && <span className="badge bg-rose-600 text-white ring-rose-700">{t("transactions.overdue")}</span>}
                            {p.depositDiff === "excess" && <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("paymentDetail.diff_excess")}</span>}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {kind === "applications" ? formatDate(p.createdAt) : p.capturedAt ? formatDate(p.capturedAt) : "—"}
                        </td>
                        {kind === "applications" && (
                          <td className={cn("px-5 py-3 text-xs", p.overdue ? "font-semibold text-rose-700" : "text-slate-500")}>
                            {p.transferDueAt ? formatDate(p.transferDueAt) : "—"}
                          </td>
                        )}
                        <td className="px-5 py-3 text-right">
                          <Link href={detail} className="text-xs font-medium text-brand-700 hover:underline">
                            {t("payments.detail")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination basePath={basePath} params={params} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}
    >
      {label}
    </Link>
  );
}
