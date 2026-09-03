"use client";

// Create / edit a billing plan.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import type { PlanRow } from "@/lib/subscriptions/list";
import { PLAN_INTERVALS, type PlanInterval } from "@/lib/subscriptions/types";
import type { MessageKey } from "@/lib/i18n";

export function PlanFormView({ merchants, initial }: { merchants: { id: string; merchantCode: string; siteName: string }[]; initial?: PlanRow }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [merchantId, setMerchantId] = useState(initial?.merchant.id ?? merchants[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [interval, setInterval] = useState<PlanInterval>(initial?.interval ?? "monthly");
  const [trialDays, setTrialDays] = useState(initial ? String(initial.trialDays) : "0");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { merchantId, name, amount: Number(amount), interval, trialDays: Number(trialDays), active };
    const res = initial
      ? await apiJson<{ id: string }>(`/api/plans/${initial.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await apiJson<{ id: string }>("/api/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(initial ? "subscriptions.planUpdated" : "subscriptions.planCreated"));
    router.push("/subscriptions");
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={initial ? t("subscriptions.editPlan") : t("subscriptions.newPlan")} description={t("subscriptions.planHelp")} helpHref="/manual/subscriptions" breadcrumbs={[{ label: t("subscriptions.title"), href: "/subscriptions" }, { label: initial ? initial.name : t("subscriptions.newPlan") }]} />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6" aria-busy={busy}>
        <FormField id="plan-merchant" label={t("subscriptions.thMerchant")} required>
          <select id="plan-merchant" className="input" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} disabled={!!initial} required>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="plan-name" label={t("subscriptions.planName")} required>
          <input id="plan-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="plan-amount" label={t("subscriptions.planAmount")} required>
            <input id="plan-amount" type="number" min={1} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
          <FormField id="plan-interval" label={t("subscriptions.planInterval")}>
            <select id="plan-interval" className="input" value={interval} onChange={(e) => setInterval(e.target.value as PlanInterval)}>
              {PLAN_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {t(`subscriptionEnums.interval.${i}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="plan-trial" label={t("subscriptions.planTrial")}>
            <input id="plan-trial" type="number" min={0} max={365} className="input" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("subscriptions.planActive")}
        </label>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !merchantId}>
            {busy ? t("common.processing") : initial ? t("subscriptions.savePlan") : t("subscriptions.createPlan")}
          </button>
        </div>
      </form>
    </div>
  );
}
