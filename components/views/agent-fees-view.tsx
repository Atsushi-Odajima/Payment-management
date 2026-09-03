"use client";

// Agent referral fees (Phase H-3): per-agent totals for a month with the
// merchant / settlement-batch breakdown, and a CSV export of the lines.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SettlementStatusBadge } from "@/components/settlement-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AgentFeeFilters, AgentFeeRow } from "@/lib/agent-fees/service";
import { isSettlementStatus } from "@/lib/settlements/types";
import { buildHref, type QueryParams } from "@/lib/query";
import { formatYen } from "@/lib/utils";

export function AgentFeesView({ rows, agents, filters }: { rows: AgentFeeRow[]; agents: { id: string; agentCode: string; name: string }[]; filters: AgentFeeFilters }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const params: QueryParams = { month: filters.month, agent: filters.agent || undefined };
  const go = (next: QueryParams) => router.push(buildHref("/agent-fees", params, next));
  const totalFee = rows.reduce((s, r) => s + r.fee, 0);
  const totalNet = rows.reduce((s, r) => s + r.netAmount, 0);
  const csvHref = buildHref("/api/agent-fees", { ...params, mode: filters.mode, format: "csv" }, {});

  return (
    <div>
      <PageHeader
        title={t("agentFees.title")}
        description={t("agentFees.description")}
        helpHref="/manual/agent-fees"
        actions={
          rows.length > 0 ? (
            <a href={csvHref} className="btn-secondary" download>
              {t("dataTable.csv")}
            </a>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("agentFees.month")}</span>
          <input type="month" className="input w-auto py-1.5 text-xs" value={filters.month} onChange={(e) => e.target.value && go({ month: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("agentFees.agent")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.agent} onChange={(e) => go({ agent: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.agentCode} {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-slate-500">{t("agentFees.statAgents")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{t("dashboard.valueCount", { count: rows.length })}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">{t("agentFees.statNet")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatYen(totalNet)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">{t("agentFees.statFee")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{formatYen(totalFee)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t("agentFees.empty")}</div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const expanded = open[r.agentId] ?? false;
            return (
              <section key={r.agentId} className="card overflow-hidden" aria-labelledby={`fee-${r.agentId}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <h2 id={`fee-${r.agentId}`} className="text-sm font-semibold text-slate-900">
                      <Link href={`/agents/${r.agentId}`} className="hover:text-brand-700">
                        {r.agentCode} · {r.name}
                      </Link>
                    </h2>
                    <p className="text-xs text-slate-500">{t("agentFees.rowMeta", { rate: r.feeRate, merchants: r.merchantCount, batches: r.batchCount })}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{t("agentFees.thNet")}</p>
                      <p className="tabular-nums text-sm text-slate-800">{formatYen(r.netAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{t("agentFees.thFee")}</p>
                      <p className="tabular-nums text-base font-bold text-brand-700">{formatYen(r.fee)}</p>
                    </div>
                    <button type="button" className="btn-secondary px-2 py-1 text-xs" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [r.agentId]: !expanded }))}>
                      {expanded ? t("agentFees.hideLines") : t("agentFees.showLines")}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="px-5 py-2">{t("agentFees.thMerchant")}</th>
                          <th scope="col" className="px-5 py-2">{t("agentFees.thPeriod")}</th>
                          <th scope="col" className="px-5 py-2">{t("agentFees.thBatchStatus")}</th>
                          <th scope="col" className="px-5 py-2 text-right">{t("agentFees.thNet")}</th>
                          <th scope="col" className="px-5 py-2 text-right">{t("agentFees.thFee")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {r.lines.map((l) => (
                          <tr key={l.batchId} className="hover:bg-slate-50/60">
                            <td className="px-5 py-2">
                              <Link href={`/merchants/${l.merchantId}`} className="text-brand-700 hover:underline">
                                {l.merchantCode} {l.siteName}
                              </Link>
                            </td>
                            <td className="px-5 py-2 text-xs text-slate-600">
                              <Link href={`/settlements/${l.batchId}`} className="hover:underline">
                                {formatDate(l.periodFrom).slice(0, 10)} – {formatDate(new Date(l.periodTo.getTime() - 1)).slice(0, 10)}
                              </Link>
                            </td>
                            <td className="px-5 py-2">{isSettlementStatus(l.status) && <SettlementStatusBadge status={l.status} />}</td>
                            <td className="px-5 py-2 text-right tabular-nums">{formatYen(l.netAmount)}</td>
                            <td className="px-5 py-2 text-right tabular-nums font-medium">{formatYen(l.fee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">{t("agentFees.note")}</p>
    </div>
  );
}
