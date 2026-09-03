"use client";

// Subscriptions (Phase H-1): list of subscriptions for the mode, the billing
// plans with their edit links, and the demo charge-failure setting.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { SubscriptionStatusBadge } from "@/components/subscription-badges";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useRole } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { PlanRow, SubscriptionFilters, SubscriptionRow } from "@/lib/subscriptions/list";
import { SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

export function SubscriptionsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
  pastDueCount,
  plans,
  demoFailPercent,
}: {
  rows: SubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: SubscriptionFilters;
  merchants: { id: string; merchantCode: string; siteName: string }[];
  pastDueCount: number;
  plans: PlanRow[];
  demoFailPercent: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    status: filters.status || undefined,
    merchant: filters.merchant || undefined,
    sort: sort.key === "nextChargeAt" && sort.dir === "asc" ? undefined : sort.key,
    dir: sort.key === "nextChargeAt" && sort.dir === "asc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/subscriptions", params, { ...next, page: undefined }));
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  const columns: DataColumn<SubscriptionRow>[] = [
    { key: "status", header: t("subscriptions.thStatus"), sortable: true, render: (r) => <SubscriptionStatusBadge status={r.status} /> },
    {
      key: "customerName",
      header: t("subscriptions.thCustomer"),
      sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.customerName}</span>
          <span className="ml-1 font-mono text-[11px] text-slate-500">{r.customerId}</span>
        </span>
      ),
    },
    { key: "merchant", header: t("subscriptions.thMerchant"), render: (r) => `${r.merchant.merchantCode} ${r.merchant.siteName}` },
    { key: "plan", header: t("subscriptions.thPlan"), render: (r) => <span>{r.plan.name} · {formatYen(r.plan.amount)} / {t(`subscriptionEnums.interval.${r.plan.interval}` as MessageKey)}</span> },
    { key: "nextChargeAt", header: t("subscriptions.thNext"), sortable: true, render: (r) => <span className={cn("whitespace-nowrap text-xs", r.status === "past_due" ? "font-semibold text-amber-700" : "text-slate-600")}>{r.nextChargeAt ? formatDate(r.nextChargeAt) : "—"}</span> },
    { key: "failCount", header: t("subscriptions.thFailures"), align: "right", render: (r) => <span className={cn("tabular-nums", r.failCount > 0 && "text-rose-700")}>{r.failCount}</span> },
    { key: "startedAt", header: t("subscriptions.thStarted"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.startedAt).slice(0, 10)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("subscriptions.title")}
        description={t("subscriptions.description")}
        helpHref="/manual/subscriptions"
        actions={
          <>
            {pastDueCount > 0 && <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("subscriptions.pastDueCount", { count: pastDueCount })}</span>}
            <Link href="/subscriptions/plans/new" className="btn-secondary">
              {t("subscriptions.newPlan")}
            </Link>
            <Link href="/subscriptions/new" className="btn-primary">
              {t("subscriptions.newSubscription")}
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card overflow-hidden" aria-labelledby="plans-heading">
          <h2 id="plans-heading" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            {t("subscriptions.plansTitle")}
          </h2>
          {plans.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("subscriptions.noPlans")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/subscriptions/plans/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{p.merchant.merchantCode} {p.merchant.siteName}</span>
                    {!p.active && <span className="badge ml-2 bg-slate-200 text-slate-600 ring-slate-300">{t("common.disabled")}</span>}
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-600">
                    {formatYen(p.amount)} / {t(`subscriptionEnums.interval.${p.interval}` as MessageKey)}
                    {p.trialDays > 0 && ` · ${t("subscriptions.trialDaysValue", { days: p.trialDays })}`}
                    {" · "}
                    {t("dashboard.valueCount", { count: p.subscriptionCount })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <DemoSettingForm percent={demoFailPercent} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("subscriptions.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`subscriptionEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("subscriptions.filterMerchant")}</span>
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
          <Link href="/subscriptions" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("subscriptions.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/subscriptions/${r.id}`} rowClassName={(r) => (r.status === "past_due" ? "bg-amber-50/40" : undefined)} basePath="/subscriptions" params={params} sort={sort} total={total} page={page} pageSize={pageSize} csvHref={`/api/subscriptions?${csvQuery.toString()}`} emptyText={t("subscriptions.empty")} minWidth="min-w-[960px]" />
    </div>
  );
}

function DemoSettingForm({ percent }: { percent: number }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { isMaster } = useRole();
  const [value, setValue] = useState(String(percent));
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await apiJson("/api/subscriptions/demo-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ demoChargeFailPercent: Number(value) }) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("subscriptions.demoSaved"));
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-3 p-5" aria-busy={busy}>
      <h2 className="text-sm font-semibold text-slate-800">{t("subscriptions.demoTitle")}</h2>
      <p className="text-xs text-slate-500">{t("subscriptions.demoHelp")}</p>
      <label htmlFor="demo-fail" className="label">
        {t("subscriptions.demoFailPercent")}
      </label>
      <input id="demo-fail" type="number" min={0} max={100} className="input w-32" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="flex justify-end">
        <button type="submit" className="btn-secondary" disabled={busy || !isMaster}>
          {t("subscriptions.demoSave")}
        </button>
      </div>
    </form>
  );
}
