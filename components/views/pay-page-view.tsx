"use client";

// Hosted checkout for a payment link (customer-facing, no admin chrome).
// Step 1: pick a method and enter the name / e-mail → POST /api/pay/:token.
// Step 2: bank transfer shows the transfer ID and deadline; other methods
// show a demo "pay" button that captures the transaction.

import { useState } from "react";
import { useApiJson, useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { FormField } from "@/components/ui/form-field";
import { LanguageToggle } from "@/components/language-toggle";
import { WirePayIcon } from "@/components/wire-pay-icon";
import type { LinkUnavailableReason } from "@/lib/payment-links/types";
import type { PaymentMethod } from "@/lib/payments/methods";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText, type MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export interface PublicLinkInfo {
  token: string;
  productName: string;
  amount: number;
  description: string | null;
  merchant: string;
  unavailable: LinkUnavailableReason | null;
  methods: PaymentMethod[];
  livemode: boolean;
}

interface CheckoutResult {
  payment: { id: string; status: string; amount: number; transferId: string | null; transferDueAt: string | null; method: string | null; orderNumber: string };
  method: PaymentMethod;
}

export function PayPageView({ link }: { link: PublicLinkInfo }) {
  const t = useT();
  const { lang } = useLang();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const [method, setMethod] = useState<PaymentMethod | "">(link.methods[0] ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [completed, setCompleted] = useState(false);

  const methodLabel = (m: PaymentMethod) => {
    const c = CATEGORIES.find((x) => x.key === m);
    return c ? pickText(c.label, lang) : m;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!method) return;
    setBusy(true);
    setError(null);
    const res = await apiJson<CheckoutResult>(`/api/pay/${link.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, customerName, customerEmail }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setResult(res.data);
  }

  async function complete() {
    if (!result) return;
    setBusy(true);
    setError(null);
    const res = await apiJson(`/api/pay/${link.token}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: result.payment.id }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setCompleted(true);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <WirePayIcon className="h-7 w-7 shrink-0 rounded-md shadow-sm" />
          <span className="text-sm font-semibold text-slate-800">Wire Pay</span>
        </span>
        <LanguageToggle />
      </div>
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{link.merchant}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{link.productName}</h1>
        {link.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{link.description}</p>}
        <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900">{formatYen(link.amount)}</p>
        {!link.livemode && <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("pay.testBadge")}</p>}

        {link.unavailable ? (
          <p role="alert" className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {t(`pay.unavailable.${link.unavailable}` as MessageKey)}
          </p>
        ) : completed && result ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900" role="status">
            <p className="font-semibold">{t("pay.completedTitle")}</p>
            <p className="mt-1">{t("pay.completedBody", { order: result.payment.orderNumber })}</p>
          </div>
        ) : result ? (
          <div className="mt-6 space-y-4" role="status">
            {result.method === "bank" ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                <p className="font-semibold">{t("pay.transferTitle")}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-sky-700">{t("pay.transferId")}</dt>
                  <dd className="font-mono text-base font-bold">{result.payment.transferId}</dd>
                  <dt className="text-sky-700">{t("pay.transferAmount")}</dt>
                  <dd className="tabular-nums">{formatYen(result.payment.amount)}</dd>
                  <dt className="text-sky-700">{t("pay.transferDue")}</dt>
                  <dd>{result.payment.transferDueAt ? formatDate(result.payment.transferDueAt) : "—"}</dd>
                </dl>
                <p className="mt-3 text-xs">{t("pay.transferHelp")}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p>{t("pay.authorizedBody", { method: methodLabel(result.method), order: result.payment.orderNumber })}</p>
                <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={complete}>
                  {busy ? t("common.processing") : t("pay.completeDemo")}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={busy}>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">{t("pay.method")}</legend>
              {link.methods.length === 0 ? (
                <p className="text-sm text-slate-500">{t("pay.noMethods")}</p>
              ) : (
                <div className="space-y-2">
                  {link.methods.map((m) => (
                    <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${method === m ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                      <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                      {methodLabel(m)}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <FormField id="pay-name" label={t("pay.customerName")} required>
              <input id="pay-name" className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} required autoComplete="name" />
            </FormField>
            <FormField id="pay-email" label={t("pay.customerEmail")}>
              <input id="pay-email" type="email" className="input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} maxLength={200} autoComplete="email" />
            </FormField>
            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy || !method}>
              {busy ? t("common.processing") : t("pay.submit", { amount: formatYen(link.amount) })}
            </button>
            <p className="text-center text-xs text-slate-500">{t("pay.demoNote")}</p>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">{t("pay.footer")}</p>
    </main>
  );
}
