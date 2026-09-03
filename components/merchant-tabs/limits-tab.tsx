"use client";

// Limits tab (B-2): per-method limits with today's / this month's usage
// gauges for the current test / live mode.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiJson, useLang, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { FEE_METHODS, type FeeMethod } from "@/lib/merchants/fees";
import type { LimitInput } from "@/lib/merchants/limits";
import type { MerchantLimits } from "@/lib/merchants/tabs";
import type { DataMode } from "@/lib/mode";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

type Draft = Record<FeeMethod, { perTransaction: string; daily: string; monthly: string }>;

function toDraft(limits: LimitInput[]): Draft {
  const d = {} as Draft;
  for (const m of FEE_METHODS) {
    const l = limits.find((x) => x.method === m);
    d[m] = { perTransaction: l?.perTransaction?.toString() ?? "", daily: l?.daily?.toString() ?? "", monthly: l?.monthly?.toString() ?? "" };
  }
  return d;
}

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export function LimitsTab({ merchantId, data, mode }: { merchantId: string; data: MerchantLimits; mode: DataMode }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(toDraft(data.limits));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const methodLabel = (m: string) => {
    const c = CATEGORIES.find((x) => x.key === m);
    return c ? pickText(c.label, lang) : m;
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = FEE_METHODS.map((m) => ({ method: m, perTransaction: num(draft[m].perTransaction), daily: num(draft[m].daily), monthly: num(draft[m].monthly) }));
    const res = await apiJson(`/api/merchants/${merchantId}/limits`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("limits.saved"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card p-5" aria-labelledby="limits-usage">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="limits-usage" className="text-sm font-semibold text-slate-800">
            {t("limits.usageTitle")}
          </h2>
          <span className={cn("badge", mode === "live" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-amber-100 text-amber-800 ring-amber-200")}>
            {mode === "live" ? t("mode.live") : t("mode.test")}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{t("limits.usageHelp")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {FEE_METHODS.map((m) => {
            const usage = data.usage.find((u) => u.method === m);
            const limit = data.limits.find((l) => l.method === m);
            return (
              <div key={m} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">{methodLabel(m)}</p>
                <Gauge label={t("limits.today")} used={usage?.todayAmount ?? 0} count={usage?.todayCount ?? 0} limit={limit?.daily ?? null} />
                <Gauge label={t("limits.month")} used={usage?.monthAmount ?? 0} count={usage?.monthCount ?? 0} limit={limit?.monthly ?? null} />
                <p className="mt-2 text-xs text-slate-500">
                  {t("limits.perTransaction")}: {limit?.perTransaction != null ? formatYen(limit.perTransaction) : t("limits.unlimited")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <form onSubmit={save} className="card space-y-4 p-5" aria-busy={busy}>
        <h2 className="text-sm font-semibold text-slate-800">{t("limits.editTitle")}</h2>
        <p className="text-xs text-slate-500">{t("limits.editHelp")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-2">{t("contract.thMethod")}</th>
                <th scope="col" className="px-4 py-2">{t("limits.perTransaction")}</th>
                <th scope="col" className="px-4 py-2">{t("limits.daily")}</th>
                <th scope="col" className="px-4 py-2">{t("limits.monthly")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FEE_METHODS.map((m) => (
                <tr key={m}>
                  <td className="px-4 py-2 text-slate-800">{methodLabel(m)}</td>
                  {(["perTransaction", "daily", "monthly"] as const).map((k) => (
                    <td key={k} className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="input w-40"
                        value={draft[m][k]}
                        placeholder={t("limits.unlimited")}
                        onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], [k]: e.target.value } }))}
                        aria-label={`${methodLabel(m)} ${t(`limits.${k}`)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.processing") : t("limits.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Gauge({ label, used, count, limit }: { label: string; used: number; count: number; limit: number | null }) {
  const t = useT();
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          {label} · {t("limits.countValue", { count })}
        </span>
        <span className="tabular-nums">
          {formatYen(used)} / {limit != null ? formatYen(limit) : t("limits.unlimited")}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {limit != null && <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />}
      </div>
      {limit != null && <p className="mt-1 text-right text-[11px] text-slate-500">{t("limits.remaining", { amount: formatYen(Math.max(0, limit - used)) })}</p>}
    </div>
  );
}
