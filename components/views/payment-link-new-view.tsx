"use client";

// Issue a payment link: merchant, product, amount, expiry, max uses.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useMode } from "@/components/mode-provider";
import { useToast } from "@/components/toast";

export function PaymentLinkNewView({ merchants }: { merchants: { id: string; merchantCode: string; siteName: string }[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { mode } = useMode();
  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? "");
  const [productName, setProductName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ id: string }>(`/api/payment-links?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId, productName, amount: Number(amount), description, expiresAt, maxUses: maxUses ? Number(maxUses) : null }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("paymentLinks.created"));
    router.push(`/payment-links/${res.data.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("paymentLinks.newTitle")} description={t("paymentLinks.newHelp")} helpHref="/manual/payment-links" breadcrumbs={[{ label: t("paymentLinks.title"), href: "/payment-links" }, { label: t("paymentLinks.newTitle") }]} />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6" aria-busy={busy}>
        <FormField id="pl-merchant" label={t("paymentLinks.thMerchant")} required>
          <select id="pl-merchant" className="input" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} required>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} {m.siteName}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <FormField id="pl-product" label={t("paymentLinks.thProduct")} required>
            <input id="pl-product" className="input" value={productName} onChange={(e) => setProductName(e.target.value)} maxLength={120} required />
          </FormField>
          <FormField id="pl-amount" label={t("paymentLinks.thAmount")} required>
            <input id="pl-amount" type="number" min={1} className="input w-40" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
        </div>
        <FormField id="pl-description" label={t("paymentLinks.descriptionLabel")}>
          <textarea id="pl-description" className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pl-expires" label={t("paymentLinks.thExpires")} help={t("paymentLinks.expiresHelp")}>
            <input id="pl-expires" type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </FormField>
          <FormField id="pl-max" label={t("paymentLinks.maxUses")} help={t("paymentLinks.maxUsesHelp")}>
            <input id="pl-max" type="number" min={0} className="input" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </FormField>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !merchantId}>
            {busy ? t("common.processing") : t("paymentLinks.issue")}
          </button>
        </div>
      </form>
    </div>
  );
}
