"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiFetch, useLang, useT } from "./language-provider";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";

export interface ProviderOption {
  id: string;
  displayName: string;
  providerKey: string;
  testMode: boolean;
}

export function NewPaymentForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const apiFetch = useApiFetch();
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState(
    () => `ORD-${Date.now().toString(36).toUpperCase()}`,
  );
  const [amount, setAmount] = useState("3980");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [autoCapture, setAutoCapture] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = providers.find((p) => p.id === providerId);

  function optionLabel(p: ProviderOption): string {
    const def = getProviderDefinition(p.providerKey);
    const name = def ? pickText(def.name, lang) : p.providerKey;
    const category = def ? getCategory(def.category) : undefined;
    const categoryLabel = category ? pickText(category.label, lang) : "";
    const mode = p.testMode ? t("common.test") : t("common.live");
    return `${p.displayName} — ${name} (${categoryLabel}) ・${mode}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId,
          orderNumber,
          amount: Number(amount),
          customerName: customerName || null,
          customerEmail: customerEmail || null,
          description: description || null,
          autoCapture,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("newPayment.createFailed"));
      router.push(`/payments/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.genericError"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label htmlFor="providerId" className="label">
          {t("newPayment.provider")} <span className="text-rose-600">*</span>
        </label>
        <select
          id="providerId"
          className="input"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          required
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {optionLabel(p)}
            </option>
          ))}
        </select>
        {selectedProvider?.testMode && (
          <p className="help">{t("newPayment.testModeHint")}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="orderNumber" className="label">
            {t("newPayment.orderNumber")} <span className="text-rose-600">*</span>
          </label>
          <input
            id="orderNumber"
            className="input"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="amount" className="label">
            {t("newPayment.amount")} <span className="text-rose-600">*</span>
          </label>
          <input
            id="amount"
            type="number"
            min={1}
            step={1}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="customerName" className="label">
            {t("newPayment.customerName")}
          </label>
          <input
            id="customerName"
            className="input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t("newPayment.customerNamePlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="customerEmail" className="label">
            {t("newPayment.customerEmail")}
          </label>
          <input
            id="customerEmail"
            type="email"
            className="input"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="label">
          {t("newPayment.memo")}
        </label>
        <textarea
          id="description"
          className="input min-h-[80px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("newPayment.memoPlaceholder")}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoCapture}
          onChange={(e) => setAutoCapture(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
        />
        {t("newPayment.autoCapture")}
      </label>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t("newPayment.submitting") : t("newPayment.submit")}
        </button>
      </div>
    </form>
  );
}
