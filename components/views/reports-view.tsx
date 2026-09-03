"use client";

// Aggregated report (Phase G-1): KPI tiles, daily / monthly series, method
// share, merchant ranking and CSV exports (summary + detail).

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { BarChart, CHART_COLORS, DonutChart, LineChart } from "@/components/charts";
import { useLang, useT } from "@/components/language-provider";
import { methodLabel } from "@/components/views/transactions-view";
import type { Report } from "@/lib/reports/service";
import { REPORT_GRANULARITIES } from "@/lib/reports/service";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { buildHref, type QueryParams } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function ReportsView({ report }: { report: Report }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const f = report.filters;
  const params: QueryParams = { granularity: f.granularity, from: f.from, to: f.to, merchant: f.merchant || undefined, method: f.method || undefined };
  const go = (next: QueryParams) => router.push(buildHref("/reports", params, next));
  const csv = (kind: "summary" | "detail") => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("mode", f.mode);
    q.set("format", "csv");
    q.set("kind", kind);
    return `/api/reports?${q.toString()}`;
  };
  const totals = report.totals;
  const tiles: { key: MessageKey; value: string; sub?: string }[] = [
    { key: "reports.kpiApplications", value: t("dashboard.valueCount", { count: totals.applications }) },
    { key: "reports.kpiCompleted", value: t("dashboard.valueCount", { count: totals.completed }), sub: formatYen(totals.completedAmount) },
    { key: "reports.kpiSuccessRate", value: `${totals.successRate}%` },
    { key: "reports.kpiAbandonRate", value: `${totals.abandonRate}%` },
    { key: "reports.kpiAverage", value: formatYen(totals.averageAmount) },
    { key: "reports.kpiRefundRate", value: `${totals.refundRate}%`, sub: formatYen(totals.refundAmount) },
    { key: "reports.kpiChargebackRate", value: `${totals.chargebackRate}%`, sub: t("dashboard.valueCount", { count: totals.chargebackCount }) },
  ];

  return (
    <div>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
        helpHref="/manual/reports"
        actions={
          <>
            <a href={csv("summary")} download className="btn-secondary">
              {t("reports.csvSummary")}
            </a>
            <a href={csv("detail")} download className="btn-secondary">
              {t("reports.csvDetail")}
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("reports.granularity")}</span>
          <select className="input w-auto py-1.5 text-xs" value={f.granularity} onChange={(e) => go({ granularity: e.target.value, from: undefined, to: undefined })}>
            {REPORT_GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {t(`reports.granularities.${g}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("reports.from")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={f.from} onChange={(e) => go({ from: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("reports.to")}</span>
          <input type="date" className="input w-auto py-1.5 text-xs" value={f.to} onChange={(e) => go({ to: e.target.value || undefined })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("reports.merchant")}</span>
          <select className="input w-auto py-1.5 text-xs" value={f.merchant} onChange={(e) => go({ merchant: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {report.merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("reports.method")}</span>
          <select className="input w-auto py-1.5 text-xs" value={f.method} onChange={(e) => go({ method: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m, lang)}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-xs text-slate-500">{t("reports.modeHint")}</span>
      </div>

      <section aria-label={t("reports.kpiTitle")} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t(tile.key)}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{tile.value}</p>
            {tile.sub && <p className="text-xs text-slate-500">{tile.sub}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card p-5" aria-labelledby="rep-series">
          <h2 id="rep-series" className="text-sm font-semibold text-slate-800">
            {t("reports.seriesTitle")}
          </h2>
          <p className="mb-3 text-xs text-slate-500">{t("reports.seriesHelp")}</p>
          {report.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{t("reports.empty")}</p>
          ) : (
            <LineChart
              points={report.series.map((p) => ({ label: p.bucket.length > 7 ? p.bucket.slice(5) : p.bucket, values: [p.amount] }))}
              series={[{ name: t("reports.seriesAmount"), color: CHART_COLORS[0] }]}
              formatValue={(v) => formatYen(v)}
            />
          )}
          {report.series.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">{t("reports.thBucket")}</th>
                    <th className="py-1 pr-3 text-right">{t("reports.kpiApplications")}</th>
                    <th className="py-1 pr-3 text-right">{t("reports.kpiCompleted")}</th>
                    <th className="py-1 text-right">{t("reports.seriesAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.series.map((p) => (
                    <tr key={p.bucket}>
                      <td className="py-1 pr-3 font-mono">{p.bucket}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{p.applications}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{p.completed}</td>
                      <td className="py-1 text-right tabular-nums">{formatYen(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="rep-share">
            <h2 id="rep-share" className="mb-3 text-sm font-semibold text-slate-800">
              {t("reports.shareTitle")}
            </h2>
            <DonutChart slices={report.shares.map((s, i) => ({ label: methodLabel(s.method, lang), value: s.amount, color: CHART_COLORS[i % CHART_COLORS.length] }))} formatValue={(v) => formatYen(v)} size={180} />
          </section>
          <section className="card p-5" aria-labelledby="rep-rank">
            <h2 id="rep-rank" className="mb-3 text-sm font-semibold text-slate-800">
              {t("reports.rankTitle")}
            </h2>
            <BarChart bars={report.ranking.map((r) => ({ label: r.siteName, sub: r.merchantCode, value: r.amount }))} formatValue={(v) => formatYen(v)} />
          </section>
        </div>
      </div>
    </div>
  );
}
