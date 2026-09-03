"use client";

// Register a chargeback (master): pick a completed transaction, amount,
// reason code, dispute deadline and an optional evidence note.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useRole } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import { CHARGEBACK_REASONS, type ChargebackReason } from "@/lib/chargebacks/types";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export interface ChargebackCandidate {
  id: string;
  orderNumber: string;
  amount: number;
  merchantName: string | null;
}

export function ChargebackNewView({ candidates, initialPaymentId, defaultDeadline }: { candidates: ChargebackCandidate[]; initialPaymentId?: string; defaultDeadline: string }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { isMaster } = useRole();
  const [paymentId, setPaymentId] = useState(initialPaymentId && candidates.some((c) => c.id === initialPaymentId) ? initialPaymentId : candidates[0]?.id ?? "");
  const selected = candidates.find((c) => c.id === paymentId);
  const [amount, setAmount] = useState(selected ? String(selected.amount) : "");
  const [reason, setReason] = useState<ChargebackReason>("fraud");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(id: string) {
    setPaymentId(id);
    const c = candidates.find((x) => x.id === id);
    if (c) setAmount(String(c.amount));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson<{ id: string }>("/api/chargebacks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, amount: Number(amount), reasonCode: reason, disputeDeadline: deadline, evidenceNote: note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("chargebacks.registered"));
    router.push(`/chargebacks/${res.data.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t("chargebacks.newTitle")} description={t("chargebacks.newHelp")} helpHref="/manual/risk" breadcrumbs={[{ label: t("chargebacks.title"), href: "/chargebacks" }, { label: t("chargebacks.newTitle") }]} />
      <form onSubmit={submit} className="card max-w-2xl space-y-5 p-6" aria-busy={busy}>
        <FormField id="cb-payment" label={t("chargebacks.payment")} required>
          <select id="cb-payment" className="input" value={paymentId} onChange={(e) => pick(e.target.value)} required>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.orderNumber} · {formatYen(c.amount)}
                {c.merchantName ? ` · ${c.merchantName}` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cb-amount" label={t("chargebacks.amount")} required help={selected ? t("chargebacks.amountHelp", { max: formatYen(selected.amount) }) : undefined}>
            <input id="cb-amount" type="number" min={1} max={selected?.amount ?? undefined} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
          <FormField id="cb-reason" label={t("chargebacks.reason")} required>
            <select id="cb-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as ChargebackReason)}>
              {CHARGEBACK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`chargebackEnums.reason.${r}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="cb-deadline" label={t("chargebacks.deadline")} required help={t("chargebacks.deadlineHelp")}>
            <input id="cb-deadline" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
          </FormField>
        </div>
        <FormField id="cb-note" label={t("chargebacks.evidence")} help={t("chargebacks.evidenceHelp")}>
          <textarea id="cb-note" className="input min-h-[96px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </FormField>
        {!isMaster && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("chargebacks.masterOnly")}</p>}
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !isMaster || !paymentId}>
            {busy ? t("common.processing") : t("chargebacks.register")}
          </button>
        </div>
      </form>
    </div>
  );
}
