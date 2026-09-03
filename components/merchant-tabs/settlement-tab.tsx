"use client";

// Merchant settlement tab (D): cycle / payout term / bank account / transfer
// fee form and the merchant's recent batches.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { FormField } from "@/components/ui/form-field";
import { SettlementStatusBadge } from "@/components/settlement-badges";
import type { MerchantSettlement } from "@/lib/merchants/tabs";
import { BANK_ACCOUNT_TYPES, PAYOUT_TERMS, SETTLEMENT_CYCLES, type BankAccountType, type PayoutTerm, type SettlementCycle } from "@/lib/settlements/types";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function SettlementTab({ merchantId, data }: { merchantId: string; data: MerchantSettlement }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const s = data.settings;
  const [cycle, setCycle] = useState<SettlementCycle>(s.settlementCycle);
  const [term, setTerm] = useState<PayoutTerm>(s.payoutTerm);
  const [bankName, setBankName] = useState(s.bankName);
  const [bankBranch, setBankBranch] = useState(s.bankBranch);
  const [accountType, setAccountType] = useState<BankAccountType | "">(s.bankAccountType ?? "");
  const [accountNumber, setAccountNumber] = useState(s.bankAccountNumber);
  const [holder, setHolder] = useState(s.bankAccountHolder);
  const [fee, setFee] = useState(String(s.settlementFee));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const res = await apiJson(`/api/merchants/${merchantId}/settlement`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settlementCycle: cycle,
        payoutTerm: term,
        bankName,
        bankBranch,
        bankAccountType: accountType || null,
        bankAccountNumber: accountNumber,
        bankAccountHolder: holder,
        settlementFee: Number(fee),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      const fe = (res.error.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors;
      if (fe) setFieldErrors(fe);
      return;
    }
    toast.show(t("settlementTab.saved"));
    router.refresh();
  }
  const err = (k: string) => (fieldErrors[k] ? t(`settlementTab.errors.${fieldErrors[k]}` as MessageKey) : null);

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card space-y-4 p-5" aria-busy={busy}>
        <h2 className="text-sm font-semibold text-slate-800">{t("settlementTab.title")}</h2>
        <p className="text-xs text-slate-500">{t("settlementTab.help")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="st-cycle" label={t("settlementTab.cycle")}>
            <select id="st-cycle" className="input" value={cycle} onChange={(e) => setCycle(e.target.value as SettlementCycle)}>
              {SETTLEMENT_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {t(`settlementEnums.cycle.${c}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="st-term" label={t("settlementTab.payoutTerm")}>
            <select id="st-term" className="input" value={term} onChange={(e) => setTerm(e.target.value as PayoutTerm)}>
              {PAYOUT_TERMS.map((p) => (
                <option key={p} value={p}>
                  {t(`settlementEnums.payoutTerm.${p}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="st-bank" label={t("settlementTab.bankName")} error={err("bankName")}>
            <input id="st-bank" className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={80} />
          </FormField>
          <FormField id="st-branch" label={t("settlementTab.bankBranch")} error={err("bankBranch")}>
            <input id="st-branch" className="input" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} maxLength={80} />
          </FormField>
          <FormField id="st-type" label={t("settlementTab.accountType")}>
            <select id="st-type" className="input" value={accountType} onChange={(e) => setAccountType(e.target.value as BankAccountType | "")}>
              <option value="">{t("common.select")}</option>
              {BANK_ACCOUNT_TYPES.map((a) => (
                <option key={a} value={a}>
                  {t(`settlementEnums.accountType.${a}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="st-number" label={t("settlementTab.accountNumber")} help={t("settlementTab.accountNumberHelp")} error={err("bankAccountNumber")}>
            <input id="st-number" className="input font-mono" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={8} inputMode="numeric" />
          </FormField>
          <FormField id="st-holder" label={t("settlementTab.accountHolder")} error={err("bankAccountHolder")}>
            <input id="st-holder" className="input" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={80} />
          </FormField>
          <FormField id="st-fee" label={t("settlementTab.settlementFee")} help={t("settlementTab.settlementFeeHelp")} error={err("settlementFee")}>
            <input id="st-fee" type="number" min={0} max={10000} className="input w-40" value={fee} onChange={(e) => setFee(e.target.value)} />
          </FormField>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.processing") : t("settlementTab.save")}
          </button>
        </div>
      </form>

      <section className="card overflow-hidden" aria-labelledby="st-batches">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id="st-batches" className="text-sm font-semibold text-slate-800">
            {t("settlementTab.batches")}
          </h2>
          <Link href="/settlements" className="text-xs font-medium text-brand-700 hover:underline">
            {t("settlementTab.openList")}
          </Link>
        </div>
        {data.batches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">{t("settlementTab.noBatches")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.batches.map((b) => (
              <li key={b.id}>
                <Link href={`/settlements/${b.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-slate-50">
                  <span className="text-slate-800">
                    {formatDate(b.periodFrom).slice(0, 10)} – {formatDate(new Date(b.periodTo.getTime() - 1)).slice(0, 10)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{formatYen(b.netAmount)}</span>
                    <SettlementStatusBadge status={b.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
