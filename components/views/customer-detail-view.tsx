"use client";

// Customer detail (Phase M): masked data with the audited unmask control,
// stored payment tokens, recent transactions, and manual anonymisation
// (admin, reason required).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { PiiValue } from "@/components/pii-value";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useCan } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { CustomerDetail } from "@/lib/customers/list";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { formatYen } from "@/lib/utils";

export function CustomerDetailView({ customer }: { customer: CustomerDetail }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const canAnonymize = useCan("customer", "anonymize");
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState(false);
  const reasonRef = useRef<{ reason: string }>({ reason: "" });
  const target = { type: "customer" as const, id: customer.id };

  async function anonymize() {
    reasonRef.current = { reason: "" };
    const ok = await confirm({ title: t("customers.anonymize"), body: t("customers.anonymizeBody", { count: customer.paymentCount, tokens: customer.tokenCount }), confirmLabel: t("customers.anonymize"), tone: "danger", fields: <ReasonField valueRef={reasonRef} />, confirmDisabled: true });
    if (!ok) return;
    setBusy(true);
    const res = await apiJson(`/api/customers/${customer.id}/anonymize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: reasonRef.current.reason }) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("customers.anonymized"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={customer.name ?? customer.externalId}
        description={`${customer.merchant.merchantCode} · ${customer.merchant.siteName}`}
        helpHref="/manual/customers"
        breadcrumbs={[{ label: t("customers.title"), href: "/customers" }, { label: customer.externalId }]}
        actions={customer.anonymizedAt ? <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{t("customers.anonymizedBadge")}</span> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100">
            <h2 className="px-5 py-3 text-sm font-semibold text-slate-800">{t("customers.sectionProfile")}</h2>
            <DetailRow label={t("customers.externalId")}>
              <span className="font-mono text-xs">{customer.externalId}</span>
            </DetailRow>
            <DetailRow label={t("customers.name")}>
              <PiiValue masked={customer.name} target={target} field="name" />
            </DetailRow>
            <DetailRow label={t("customers.email")}>
              <PiiValue masked={customer.email} target={target} field="email" className="font-mono text-xs" />
            </DetailRow>
            <DetailRow label={t("customers.phone")}>
              <PiiValue masked={customer.phone} target={target} field="phone" className="font-mono text-xs" />
            </DetailRow>
            <DetailRow label={t("customers.thMerchant")}>
              <Link href={`/merchants/${customer.merchant.id}`} className="text-brand-700 hover:underline">
                {customer.merchant.merchantCode} — {customer.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("customers.thCreated")}>{formatDate(customer.createdAt)}</DetailRow>
            {customer.anonymizedAt && (
              <DetailRow label={t("customers.anonymizedAt")}>
                {formatDate(customer.anonymizedAt)}
                {customer.anonymizeReason && <span className="ml-2 text-xs text-slate-500">{customer.anonymizeReason}</span>}
              </DetailRow>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("customers.sectionTokens", { count: customer.tokens.length })}</h2>
            {customer.tokens.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t("customers.noTokens")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {customer.tokens.map((k) => (
                  <li key={k.id} className="flex items-center justify-between px-5 py-3">
                    <span>
                      <span className="font-medium uppercase text-slate-900">{k.brand}</span>
                      <span className="ml-2 font-mono text-xs">•••• {k.last4}</span>
                      <span className="ml-2 text-xs text-slate-500">{k.expiry}</span>
                    </span>
                    <span className="text-xs text-slate-500">{k.lastUsedAt ? t("customers.tokenLastUsed", { at: formatDate(k.lastUsedAt) }) : formatDate(k.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">{t("customers.sectionPayments", { count: customer.paymentCount })}</h2>
            {customer.payments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t("customers.noPayments")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {customer.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <span>
                      <Link href={`/${["captured", "partially_refunded", "refunded", "chargeback"].includes(p.status) ? "payments" : "applications"}/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {p.orderNumber}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{formatDate(p.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums font-medium">{formatYen(p.amount)}</span>
                      {isPaymentStatus(p.status) && <PaymentStatusBadge status={p.status} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("customers.anonymize")}</p>
            <p className="mt-1">{t("customers.anonymizeHelp")}</p>
            <button type="button" className="btn-danger mt-3 w-full" disabled={!canAnonymize || busy || customer.anonymizedAt !== null} onClick={anonymize}>
              {busy ? t("common.processing") : t("customers.anonymize")}
            </button>
            {!canAnonymize && <p className="mt-1 text-[11px] text-slate-400">{t("customers.anonymizeAdminOnly")}</p>}
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("customers.maskTitle")}</p>
            <p className="mt-1">{t("customers.maskNote")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReasonField({ valueRef }: { valueRef: MutableRefObject<{ reason: string }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  useEffect(() => {
    valueRef.current = { reason };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, update, valueRef]);
  return (
    <div>
      <label htmlFor="anonymize-reason" className="label">
        {t("customers.anonymizeReason")}
      </label>
      <input id="anonymize-reason" className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
    </div>
  );
}
