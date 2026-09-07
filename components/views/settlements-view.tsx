"use client";

// Settlement list (精算管理): batches per merchant and period with the
// generate form (demo replacement for the cycle cron).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { SettlementStatusBadge } from "@/components/settlement-badges";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/toast";
import { FormField } from "@/components/ui/form-field";
import type { SettlementFilters, SettlementRow } from "@/lib/settlements/list";
import { lastClosedPeriod } from "@/lib/settlements/schedule";
import { SETTLEMENT_STATUSES, isSettlementCycle } from "@/lib/settlements/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export interface MerchantChoice {
  id: string;
  merchantCode: string;
  siteName: string;
  settlementCycle: string;
}

export function SettlementsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  merchants,
}: {
  rows: SettlementRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: SettlementFilters;
  merchants: MerchantChoice[];
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params: QueryParams = {
    status: filters.status || undefined,
    merchant: filters.merchant || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: sort.key === "periodFrom" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "periodFrom" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/settlements", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.status || filters.merchant || filters.from || filters.to);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");
  const period = (r: SettlementRow) => `${formatDate(r.periodFrom).slice(0, 10)} – ${formatDate(new Date(r.periodTo.getTime() - 1)).slice(0, 10)}`;

  const columns: DataColumn<SettlementRow>[] = [
    { key: "periodFrom", header: t("settlements.thPeriod"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-700">{period(r)}</span> },
    { key: "merchant", header: t("settlements.thMerchant"), render: (r) => `${r.merchant.merchantCode} ${r.merchant.siteName}` },
    { key: "gross", header: t("settlements.thGross"), align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.grossAmount)}</span> },
    { key: "deductions", header: t("settlements.thDeductions"), align: "right", render: (r) => <span className="tabular-nums text-slate-600">−{formatYen(r.feeAmount + r.refundAmount + r.chargebackAmount + r.settlementFee)}</span> },
    { key: "netAmount", header: t("settlements.thNet"), sortable: true, align: "right", render: (r) => <span className="font-semibold tabular-nums">{formatYen(r.netAmount)}</span> },
    { key: "status", header: t("settlements.thStatus"), sortable: true, render: (r) => <SettlementStatusBadge status={r.status} /> },
    { key: "invoiceNo", header: t("settlements.invoiceNo"), render: (r) => <span className="font-mono text-xs text-slate-600">{r.invoiceNo ?? "—"}</span> },
    { key: "scheduledAt", header: t("settlements.thScheduled"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs">{r.paidAt ? formatDate(r.paidAt) : r.scheduledAt ? formatDate(r.scheduledAt).slice(0, 10) : "—"}</span> },
    { key: "lines", header: t("settlements.thLines"), align: "right", render: (r) => <span className="tabular-nums text-xs text-slate-600">{r.lineCount}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("settlements.title")} description={t("settlements.description")} helpHref="/manual/settlements" />

      <GenerateForm merchants={merchants} />

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("settlements.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {SETTLEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`settlementEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("settlements.filterMerchant")}</span>
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
          <span>{t("settlements.filterFrom")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("settlements.filterTo")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={filters.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        {hasFilter && (
          <Link href="/settlements" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("settlements.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/settlements/${r.id}`}
        rowClassName={(r) => (r.status === "held" ? "bg-rose-50/40" : undefined)}
        basePath="/settlements"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/settlements?${csvQuery.toString()}`}
        emptyText={t("settlements.empty")}
        minWidth="min-w-[960px]"
      />
    </div>
  );
}

function GenerateForm({ merchants }: { merchants: MerchantChoice[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { mode } = useMode();
  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? "");
  const initial = lastClosedPeriod(isSettlementCycle(merchants[0]?.settlementCycle) ? merchants[0].settlementCycle : "monthly");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickMerchant(id: string) {
    setMerchantId(id);
    const m = merchants.find((x) => x.id === id);
    const p = lastClosedPeriod(isSettlementCycle(m?.settlementCycle) ? m!.settlementCycle : "monthly");
    setFrom(p.from);
    setTo(p.to);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ id: string }>(`/api/settlements/generate?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId, from, to }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("settlements.generated"));
    router.push(`/settlements/${res.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mb-6 p-5" aria-busy={busy}>
      <h2 className="text-sm font-semibold text-slate-800">{t("settlements.generateTitle")}</h2>
      <p className="mt-1 text-xs text-slate-500">{t("settlements.generateHelp")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <FormField id="gen-merchant" label={t("settlements.filterMerchant")}>
          <select id="gen-merchant" className="input" value={merchantId} onChange={(e) => pickMerchant(e.target.value)}>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName} ({t(`settlementEnums.cycle.${isSettlementCycle(m.settlementCycle) ? m.settlementCycle : "monthly"}` as MessageKey)})
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="gen-from" label={t("settlements.periodFrom")}>
          <input id="gen-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </FormField>
        <FormField id="gen-to" label={t("settlements.periodTo")}>
          <input id="gen-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
        </FormField>
        <button type="submit" className="btn-primary" disabled={busy || !merchantId}>
          {busy ? t("common.processing") : t("settlements.generate")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
    </form>
  );
}
