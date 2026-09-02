"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiJson, useLang, useT } from "./language-provider";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { ASYNC_CATEGORIES } from "@/lib/payments/transitions";
import { pickText } from "@/lib/i18n";

export interface ProviderOption {
  id: string;
  displayName: string;
  providerKey: string;
  testMode: boolean;
}

const MAX_AMOUNT = 99_999_999;

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function NewPaymentForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const apiJson = useApiJson();
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState(() => `ORD-${Date.now().toString(36).toUpperCase()}`);
  const [amount, setAmount] = useState("3980");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [autoCapture, setAutoCapture] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  // One key per form "attempt": a retry after a network failure reuses it so
  // the server can recognize the duplicate; a success mints a fresh one.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const selectedProvider = providers.find((p) => p.id === providerId);
  const selectedDef = selectedProvider ? getProviderDefinition(selectedProvider.providerKey) : undefined;
  const isAsync = selectedDef ? ASYNC_CATEGORIES.includes(selectedDef.category) : false;

  function optionLabel(p: ProviderOption): string {
    const def = getProviderDefinition(p.providerKey);
    const name = def ? pickText(def.name, lang) : p.providerKey;
    const category = def ? getCategory(def.category) : undefined;
    const categoryLabel = category ? pickText(category.label, lang) : "";
    const mode = p.testMode ? t("common.test") : t("common.live");
    return `${p.displayName} — ${name} (${categoryLabel}) · ${mode}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    const res = await apiJson<{ id: string }>("/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        providerId,
        orderNumber,
        amount: Number(amount),
        customerName: customerName || null,
        customerEmail: customerEmail || null,
        description: description || null,
        autoCapture: isAsync ? false : autoCapture,
      }),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error.message);
      const details = res.error.details as { fieldErrors?: Record<string, unknown> } | undefined;
      if (details?.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.keys(details.fieldErrors).map((k) => [k, true])));
      }
      return;
    }
    setIdempotencyKey(newIdempotencyKey());
    router.push(`/payments/${res.data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6" aria-busy={submitting}>
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
        {selectedProvider?.testMode && <p className="help">{t("newPayment.testModeHint")}</p>}
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
            maxLength={64}
            aria-invalid={fieldErrors.orderNumber || undefined}
          />
        </div>
        <div>
          <label htmlFor="amount" className="label">
            {t("newPayment.amount")} <span className="text-rose-600">*</span>
          </label>
          <input
            id="amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_AMOUNT}
            step={1}
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            aria-invalid={fieldErrors.amount || undefined}
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
            maxLength={120}
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
            maxLength={200}
            aria-invalid={fieldErrors.customerEmail || undefined}
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
          maxLength={2000}
        />
      </div>

      {isAsync ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("newPayment.asyncHint")}
        </p>
      ) : (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoCapture}
            onChange={(e) => setAutoCapture(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
          />
          {t("newPayment.autoCapture")}
        </label>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
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
