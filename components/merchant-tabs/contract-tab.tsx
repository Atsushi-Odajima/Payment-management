"use client";

// Contract & fees tab (B-1, B-3): the current plan and rates, upcoming /
// past schedules, a form to set a new plan from an effective date, and the
// transfer-deadline / refund-window days.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiJson, useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { FormField } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DetailRow } from "@/components/ui/detail-row";
import { CONTRACT_PLANS, FEE_METHODS, PLAN_DEFAULT_RATES, ratesForPlan, type ContractPlan, type FeeRates, type FeeScheduleView } from "@/lib/merchants/fees";
import type { MerchantContract } from "@/lib/merchants/tabs";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText, type MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

type Wire = Omit<FeeScheduleView, "effectiveFrom" | "createdAt"> & { effectiveFrom: string; createdAt: string };
const withDates = (s: Wire): FeeScheduleView => ({ ...s, effectiveFrom: new Date(s.effectiveFrom), createdAt: new Date(s.createdAt) });

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export function ContractTab({ merchantId, contract }: { merchantId: string; contract: MerchantContract }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [schedules, setSchedules] = useState<FeeScheduleView[]>(contract.schedules);
  const current = schedules.find((s) => s.current) ?? null;
  const methodLabel = (m: string) => {
    const c = CATEGORIES.find((x) => x.key === m);
    return c ? pickText(c.label, lang) : m;
  };

  // New schedule form
  const [showForm, setShowForm] = useState(false);
  const [plan, setPlan] = useState<ContractPlan>(current?.plan ?? "standard");
  const [rates, setRates] = useState<FeeRates>(current?.rates ?? PLAN_DEFAULT_RATES.standard);
  const [effectiveFrom, setEffectiveFrom] = useState(todayInTokyo());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownRates = plan === "custom" ? rates : ratesForPlan(plan);

  function choosePlan(p: ContractPlan) {
    setPlan(p);
    if (p !== "custom") setRates(ratesForPlan(p));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ schedules: Wire[] }>(`/api/merchants/${merchantId}/fees`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, rates: plan === "custom" ? rates : undefined, effectiveFrom, note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSchedules(res.data.schedules.map(withDates));
    setShowForm(false);
    setNote("");
    toast.show(t("contract.saved"));
    router.refresh();
  }

  // Terms form
  const [transferDueDays, setTransferDueDays] = useState(String(contract.transferDueDays));
  const [cvsDueDays, setCvsDueDays] = useState(String(contract.cvsDueDays));
  const [refundWindowDays, setRefundWindowDays] = useState(String(contract.refundWindowDays));
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  async function saveTerms(e: React.FormEvent) {
    e.preventDefault();
    setTermsBusy(true);
    setTermsError(null);
    const res = await apiJson(`/api/merchants/${merchantId}/terms`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transferDueDays: Number(transferDueDays), cvsDueDays: Number(cvsDueDays), refundWindowDays: Number(refundWindowDays) }),
    });
    setTermsBusy(false);
    if (!res.ok) {
      setTermsError(res.error.message);
      return;
    }
    toast.show(t("contract.termsSaved"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card" aria-labelledby="contract-current">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 id="contract-current" className="text-sm font-semibold text-slate-800">
            {t("contract.current")}
          </h2>
          {!showForm && (
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              {t("contract.change")}
            </button>
          )}
        </div>
        {current ? (
          <div className="divide-y divide-slate-100">
            <DetailRow label={t("contract.plan")}>
              <span className="badge bg-brand-50 text-brand-800 ring-brand-200">{t(`contract.plans.${current.plan}` as MessageKey)}</span>
            </DetailRow>
            <DetailRow label={t("contract.effectiveFrom")}>{formatDate(current.effectiveFrom)}</DetailRow>
            <div className="px-5 py-3">
              <RatesTable rates={current.rates} methodLabel={methodLabel} />
            </div>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">{t("contract.none")}</p>
        )}
      </section>

      {showForm && (
        <form onSubmit={submit} className="card space-y-5 p-5" aria-busy={busy}>
          <h2 className="text-sm font-semibold text-slate-800">{t("contract.newTitle")}</h2>
          <SegmentedControl<ContractPlan>
            label={t("contract.plan")}
            value={plan}
            onChange={choosePlan}
            options={CONTRACT_PLANS.map((p) => ({ value: p, label: t(`contract.plans.${p}` as MessageKey) }))}
          />
          <p className="-mt-3 text-xs text-slate-500">{plan === "custom" ? t("contract.customHelp") : t("contract.planHelp")}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2">{t("contract.thMethod")}</th>
                  <th scope="col" className="px-4 py-2">{t("contract.thRate")}</th>
                  <th scope="col" className="px-4 py-2">{t("contract.thFixed")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEE_METHODS.map((m) => (
                  <tr key={m}>
                    <td className="px-4 py-2 text-slate-800">{methodLabel(m)}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        className={cn("input w-32", plan !== "custom" && "bg-slate-50 text-slate-600")}
                        value={shownRates[m].ratePercent}
                        readOnly={plan !== "custom"}
                        onChange={(e) => setRates((r) => ({ ...r, [m]: { ...r[m], ratePercent: Number(e.target.value) } }))}
                        aria-label={`${methodLabel(m)} ${t("contract.thRate")}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step={1}
                        min={0}
                        className={cn("input w-32", plan !== "custom" && "bg-slate-50 text-slate-600")}
                        value={shownRates[m].fixedFee}
                        readOnly={plan !== "custom"}
                        onChange={(e) => setRates((r) => ({ ...r, [m]: { ...r[m], fixedFee: Number(e.target.value) } }))}
                        aria-label={`${methodLabel(m)} ${t("contract.thFixed")}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fee-effective" label={t("contract.effectiveFrom")} required help={t("contract.effectiveHelp")}>
              <input id="fee-effective" type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
            </FormField>
            <FormField id="fee-note" label={t("contract.note")}>
              <input id="fee-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </FormField>
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t("common.processing") : t("contract.save")}
            </button>
          </div>
        </form>
      )}

      {schedules.length > 1 && (
        <section className="card overflow-hidden" aria-labelledby="contract-history">
          <h2 id="contract-history" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            {t("contract.history")}
          </h2>
          <ul className="divide-y divide-slate-100">
            {schedules.map((s) => (
              <li key={s.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm", s.current && "bg-brand-50/40")}>
                <div>
                  <span className="font-medium text-slate-900">{t(`contract.plans.${s.plan}` as MessageKey)}</span>
                  <span className="ml-2 text-xs text-slate-500">{t("contract.effectiveFrom")}: {formatDate(s.effectiveFrom)}</span>
                  {s.note && <span className="ml-2 text-xs text-slate-500">— {s.note}</span>}
                </div>
                <span className="text-xs">
                  {s.current && <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">{t("contract.currentBadge")}</span>}
                  {s.upcoming && <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("contract.upcomingBadge")}</span>}
                  {!s.current && !s.upcoming && <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{t("contract.pastBadge")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={saveTerms} className="card space-y-4 p-5" aria-busy={termsBusy}>
        <h2 className="text-sm font-semibold text-slate-800">{t("contract.termsTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="transferDueDays" label={t("contract.transferDueDays")} help={t("contract.transferDueDaysHelp")}>
            <input id="transferDueDays" type="number" min={1} max={60} className="input w-32" value={transferDueDays} onChange={(e) => setTransferDueDays(e.target.value)} required />
          </FormField>
          <FormField id="cvsDueDays" label={t("contract.cvsDueDays")} help={t("contract.cvsDueDaysHelp")}>
            <input id="cvsDueDays" type="number" min={1} max={30} className="input w-32" value={cvsDueDays} onChange={(e) => setCvsDueDays(e.target.value)} required />
          </FormField>
          <FormField id="refundWindowDays" label={t("contract.refundWindowDays")} help={t("contract.refundWindowDaysHelp")}>
            <input id="refundWindowDays" type="number" min={0} max={365} className="input w-32" value={refundWindowDays} onChange={(e) => setRefundWindowDays(e.target.value)} required />
          </FormField>
        </div>
        {termsError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {termsError}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={termsBusy}>
            {termsBusy ? t("common.processing") : t("contract.saveTerms")}
          </button>
        </div>
      </form>
    </div>
  );
}

function RatesTable({ rates, methodLabel }: { rates: FeeRates; methodLabel: (m: string) => string }) {
  const t = useT();
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th scope="col" className="py-1 pr-4">{t("contract.thMethod")}</th>
          <th scope="col" className="py-1 pr-4 text-right">{t("contract.thRate")}</th>
          <th scope="col" className="py-1 text-right">{t("contract.thFixed")}</th>
        </tr>
      </thead>
      <tbody>
        {FEE_METHODS.map((m) => (
          <tr key={m}>
            <td className="py-1 pr-4 text-slate-800">{methodLabel(m)}</td>
            <td className="py-1 pr-4 text-right tabular-nums">{rates[m].ratePercent.toFixed(2)}%</td>
            <td className="py-1 text-right tabular-nums">{formatYen(rates[m].fixedFee)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
