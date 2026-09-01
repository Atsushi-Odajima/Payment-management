"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  useFormatDateTime,
  useLang,
  useT,
} from "@/components/language-provider";
import { CATEGORIES, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { PAYMENT_STATUS_COLOR, cn, formatYen, isPaymentStatus } from "@/lib/utils";
import type { CategoryKey } from "@/lib/providers/types";

export interface DashboardPaymentItem {
  id: string;
  orderNumber: string;
  providerKey: string;
  amount: number;
  status: string;
  createdAt: Date;
}

export interface DashboardViewProps {
  providerCount: number;
  activeProviderCount: number;
  totalSalesAmount: number;
  totalSalesCount: number;
  todaySalesAmount: number;
  todaySalesCount: number;
  categoryCounts: Record<CategoryKey, number>;
  payments: DashboardPaymentItem[];
}

export function DashboardView(props: DashboardViewProps) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <>
            <Link href="/providers/new" className="btn-primary">
              {t("dashboard.addProvider")}
            </Link>
            <Link href="/payments/new" className="btn-secondary">
              {t("dashboard.createPayment")}
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("dashboard.statProviders")}
          value={t("dashboard.statProvidersValue", { count: props.providerCount })}
          sub={t("dashboard.statProvidersSub", { count: props.activeProviderCount })}
        />
        <Stat
          label={t("dashboard.statTotalSales")}
          value={formatYen(props.totalSalesAmount)}
          sub={t("dashboard.statTotalSalesSub", { count: props.totalSalesCount })}
        />
        <Stat
          label={t("dashboard.statTodaySales")}
          value={formatYen(props.todaySalesAmount)}
          sub={t("dashboard.statTodaySalesSub", { count: props.todaySalesCount })}
        />
        <Stat
          label={t("dashboard.statCategories")}
          value={t("dashboard.statCategoriesValue", { count: CATEGORIES.length })}
          sub={t("dashboard.statCategoriesSub")}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("dashboard.recentPayments")}
            </h2>
            <Link href="/payments" className="text-xs text-brand-700 hover:underline">
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {props.payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <p className="text-sm text-slate-500">{t("dashboard.emptyPayments")}</p>
              <Link href="/payments/new" className="btn-primary">
                {t("dashboard.emptyPaymentsCta")}
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {props.payments.map((p) => {
                const def = getProviderDefinition(p.providerKey);
                return (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/payments/${p.id}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700"
                      >
                        {p.orderNumber}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {def ? pickText(def.name, lang) : p.providerKey} ·{" "}
                        {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatYen(p.amount)}
                      </span>
                      <span
                        className={cn(
                          "badge",
                          PAYMENT_STATUS_COLOR[p.status] ??
                            "bg-slate-100 text-slate-700 ring-slate-200",
                        )}
                      >
                        {isPaymentStatus(p.status) ? t(`status.${p.status}`) : p.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("dashboard.categoryConnections")}
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {pickText(c.label, lang)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pickText(c.description, lang)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {props.categoryCounts[c.key] ?? 0}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-5 py-3">
            <Link
              href="/providers/new"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {t("dashboard.connectNewProvider")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
