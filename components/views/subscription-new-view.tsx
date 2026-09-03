"use client";

// Start a subscription: pick an active plan and enter the customer.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/toast";
import type { PlanRow } from "@/lib/subscriptions/list";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function SubscriptionNewView({ plans }: { plans: PlanRow[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { mode } = useMode();
  const active = plans.filter((p) => p.active);
  const [planId, setPlanId] = useState(active[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = active.find((p) => p.id === planId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ id: string }>(`/api/subscriptions?mode=${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId, customerId, customerName, customerEmail }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("subscriptions.created"));
    router.push(`/subscriptions/${res.data.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("subscriptions.newSubscription")} description={t("subscriptions.newHelp")} helpHref="/manual/subscriptions" breadcrumbs={[{ label: t("subscriptions.title"), href: "/subscriptions" }, { label: t("subscriptions.newSubscription") }]} />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6" aria-busy={busy}>
        <FormField id="sub-plan" label={t("subscriptions.thPlan")} required help={plan ? `${formatYen(plan.amount)} / ${t(`subscriptionEnums.interval.${plan.interval}` as MessageKey)}${plan.trialDays ? ` · ${t("subscriptions.trialDaysValue", { days: plan.trialDays })}` : ""}` : undefined}>
          <select id="sub-plan" className="input" value={planId} onChange={(e) => setPlanId(e.target.value)} required>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.merchant.merchantCode} · {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="sub-customer-id" label={t("subscriptions.customerId")} required>
            <input id="sub-customer-id" className="input font-mono" value={customerId} onChange={(e) => setCustomerId(e.target.value)} maxLength={64} required />
          </FormField>
          <FormField id="sub-customer-name" label={t("subscriptions.thCustomer")} required>
            <input id="sub-customer-name" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} required />
          </FormField>
        </div>
        <FormField id="sub-customer-email" label={t("subscriptions.customerEmail")} help={t("subscriptions.emailHelp")}>
          <input id="sub-customer-email" type="email" className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} maxLength={200} />
        </FormField>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !planId}>
            {busy ? t("common.processing") : t("subscriptions.start")}
          </button>
        </div>
      </form>
    </div>
  );
}
