"use client";

// Subscription detail: customer / plan facts, charge history and the
// operator actions (charge now, pause, resume, cancel).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { PiiValue } from "@/components/pii-value";
import { SubscriptionStatusBadge } from "@/components/subscription-badges";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useCan } from "@/components/session-provider";
import type { ChargeRow, SubscriptionRow } from "@/lib/subscriptions/list";
import { isPaymentStatus } from "@/lib/payments/transitions";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

type Action = "charge" | "chargeFail" | "pause" | "resume" | "cancel";

export function SubscriptionDetailView({ subscription: s, charges }: { subscription: SubscriptionRow; charges: ChargeRow[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMaster = useCan("subscription", "action");

  const canCharge = s.status === "trialing" || s.status === "active" || s.status === "past_due";
  const available: Action[] = isMaster ? [...(canCharge ? (["charge", "chargeFail", "pause"] as Action[]) : []), ...(s.status === "suspended" ? (["resume"] as Action[]) : []), ...(s.status !== "cancelled" ? (["cancel"] as Action[]) : [])] : [];

  async function run(action: Action) {
    const ok = await confirm({ title: t(`subscriptions.actions.${action}` as MessageKey), body: t(`subscriptions.confirm.${action}` as MessageKey, { amount: formatYen(s.plan.amount), customer: s.customerName }), confirmLabel: t(`subscriptions.actions.${action}` as MessageKey), tone: action === "cancel" ? "danger" : "primary" });
    if (!ok) return;
    setBusy(action);
    setError(null);
    const path = action === "chargeFail" ? "charge" : action;
    const body = action === "charge" ? { outcome: "success" } : action === "chargeFail" ? { outcome: "failure" } : {};
    const res = await apiJson(`/api/subscriptions/${s.id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(`subscriptions.done.${action}` as MessageKey));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={s.customerName}
        description={`${s.plan.name} · ${formatYen(s.plan.amount)} / ${t(`subscriptionEnums.interval.${s.plan.interval}` as MessageKey)}`}
        helpHref="/manual/subscriptions"
        breadcrumbs={[{ label: t("subscriptions.title"), href: "/subscriptions" }, { label: s.id }]}
        actions={
          <>
            <ModeBadge live={s.livemode} />
            <SubscriptionStatusBadge status={s.status} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="sub-heading">
            <h2 id="sub-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("subscriptions.sectionSubscription")}
            </h2>
            <DetailRow label={t("subscriptions.thMerchant")}>
              <Link href={`/merchants/${s.merchant.id}`} className="text-brand-700 hover:underline">
                {s.merchant.merchantCode} — {s.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("subscriptions.thPlan")}>
              <Link href={`/subscriptions/plans/${s.plan.id}`} className="text-brand-700 hover:underline">
                {s.plan.name}
              </Link>
            </DetailRow>
            <DetailRow label={t("subscriptions.customerId")}>
              <span className="font-mono text-xs">{s.customerId}</span>
            </DetailRow>
            <DetailRow label={t("subscriptions.customerEmail")}>
              <PiiValue masked={s.customerEmail} target={{ type: "subscription", id: s.id }} field="customerEmail" />
            </DetailRow>
            <DetailRow label={t("subscriptions.customerName")}>
              <PiiValue masked={s.customerName} target={{ type: "subscription", id: s.id }} field="customerName" />
            </DetailRow>
            <DetailRow label={t("subscriptions.thStatus")}>
              <SubscriptionStatusBadge status={s.status} />
            </DetailRow>
            <DetailRow label={t("subscriptions.thNext")}>{s.nextChargeAt ? formatDate(s.nextChargeAt) : "—"}</DetailRow>
            <DetailRow label={t("subscriptions.lastChargeAt")}>{s.lastChargeAt ? formatDate(s.lastChargeAt) : "—"}</DetailRow>
            <DetailRow label={t("subscriptions.thFailures")}>{s.failCount}</DetailRow>
            <DetailRow label={t("subscriptions.thStarted")}>{formatDate(s.startedAt)}</DetailRow>
            <DetailRow label={t("subscriptions.cancelledAt")}>{s.cancelledAt ? formatDate(s.cancelledAt) : "—"}</DetailRow>
          </section>

          <section className="card overflow-hidden" aria-labelledby="charges-heading">
            <h2 id="charges-heading" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              {t("subscriptions.chargeHistory", { count: charges.length })}
            </h2>
            {charges.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("subscriptions.noCharges")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span>
                      <Link href={`/payments/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.orderNumber}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">{formatDate(c.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatYen(c.amount)}</span>
                      {isPaymentStatus(c.status) && <PaymentStatusBadge status={c.status} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy !== null}>
              {available.map((a) => (
                <button key={a} type="button" className={`w-full ${a === "cancel" ? "btn-danger" : a === "charge" || a === "resume" ? "btn-primary" : "btn-secondary"}`} disabled={busy !== null} onClick={() => run(a)}>
                  {busy === a ? t("common.processing") : t(`subscriptions.actions.${a}` as MessageKey)}
                </button>
              ))}
              {available.length === 0 && <p className="text-xs text-slate-500">{isMaster ? t("subscriptions.noActions") : t("subscriptions.masterOnly")}</p>}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("subscriptions.cycleTitle")}</p>
            <p className="mt-1">{t("subscriptions.cycleBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
