"use client";

// Chargeback detail: case facts and the master's dispute / resolve / confirm actions.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { ChargebackStatusBadge } from "@/components/risk-badges";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useRole } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { ChargebackRow } from "@/lib/chargebacks/list";
import { isPaymentStatus } from "@/lib/payments/transitions";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

type Action = "dispute" | "won" | "lost" | "confirm";

export function ChargebackDetailView({ chargeback: cb }: { chargeback: ChargebackRow }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { isMaster } = useRole();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<{ note: string }>({ note: "" });

  const available: Action[] = cb.status === "received" ? ["dispute", "confirm"] : cb.status === "disputed" ? ["won", "lost", "confirm"] : cb.status === "lost" ? ["confirm"] : [];

  async function run(action: Action) {
    noteRef.current = { note: "" };
    const ok = await confirm({
      title: t(`chargebacks.actions.${action}` as MessageKey),
      body: t(`chargebacks.confirm.${action}` as MessageKey, { amount: formatYen(cb.amount), orderNumber: cb.orderNumber }),
      confirmLabel: t(`chargebacks.actions.${action}` as MessageKey),
      tone: action === "lost" || action === "confirm" ? "danger" : "primary",
      fields: action === "dispute" || action === "won" || action === "lost" ? <NoteField valueRef={noteRef} required={action === "dispute"} /> : undefined,
      confirmDisabled: action === "dispute",
    });
    if (!ok) return;
    setBusy(action);
    setError(null);
    const path = action === "dispute" ? "dispute" : action === "confirm" ? "confirm" : "resolve";
    const body = action === "dispute" ? { evidenceNote: noteRef.current.note } : action === "confirm" ? {} : { outcome: action, note: noteRef.current.note };
    const res = await apiJson(`/api/chargebacks/${cb.id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(`chargebacks.done.${action}` as MessageKey));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("chargebacks.detailTitle", { orderNumber: cb.orderNumber })}
        description={`${formatYen(cb.amount)} · ${t(`chargebackEnums.reason.${cb.reasonCode}` as MessageKey)}`}
        helpHref="/manual/risk"
        breadcrumbs={[{ label: t("chargebacks.title"), href: "/chargebacks" }, { label: cb.id }]}
        actions={
          <>
            <ModeBadge live={cb.livemode} />
            <ChargebackStatusBadge status={cb.status} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card divide-y divide-slate-100" aria-labelledby="cb-heading">
          <h2 id="cb-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
            {t("chargebacks.sectionCase")}
          </h2>
          <DetailRow label={t("chargebacks.payment")}>
            <Link href={`/payments/${cb.paymentId}`} className="text-brand-700 hover:underline">
              {cb.orderNumber}
            </Link>
            <span className="ml-2">{isPaymentStatus(cb.paymentStatus) && <PaymentStatusBadge status={cb.paymentStatus} />}</span>
          </DetailRow>
          <DetailRow label={t("chargebacks.thMerchant")}>
            {cb.merchant ? (
              <Link href={`/merchants/${cb.merchant.id}`} className="text-brand-700 hover:underline">
                {cb.merchant.merchantCode} — {cb.merchant.siteName}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label={t("chargebacks.amount")}>
            <span className="text-lg font-semibold tabular-nums">{formatYen(cb.amount)}</span>
            <span className="ml-2 text-xs text-slate-500">/ {formatYen(cb.paymentAmount)}</span>
          </DetailRow>
          <DetailRow label={t("chargebacks.reason")}>{t(`chargebackEnums.reason.${cb.reasonCode}` as MessageKey)}</DetailRow>
          <DetailRow label={t("chargebacks.thStatus")}>
            <ChargebackStatusBadge status={cb.status} />
          </DetailRow>
          <DetailRow label={t("chargebacks.thOccurred")}>{formatDate(cb.occurredAt)}</DetailRow>
          <DetailRow label={t("chargebacks.deadline")}>{cb.disputeDeadlineAt ? formatDate(cb.disputeDeadlineAt).slice(0, 10) : "—"}</DetailRow>
          <DetailRow label={t("chargebacks.resolvedAt")}>{cb.resolvedAt ? formatDate(cb.resolvedAt) : "—"}</DetailRow>
          <DetailRow label={t("chargebacks.evidence")}>
            <span className="whitespace-pre-wrap">{cb.evidenceNote || "—"}</span>
          </DetailRow>
        </section>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy !== null}>
              {available.map((a) => (
                <button key={a} type="button" className={`w-full ${a === "lost" || a === "confirm" ? "btn-danger" : "btn-primary"}`} disabled={!isMaster || busy !== null} onClick={() => run(a)}>
                  {busy === a ? t("common.processing") : t(`chargebacks.actions.${a}` as MessageKey)}
                </button>
              ))}
              {available.length === 0 && <p className="text-xs text-slate-500">{t("chargebacks.noActions")}</p>}
              {!isMaster && available.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("chargebacks.masterOnly")}</p>}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("chargebacks.flowTitle")}</p>
            <p className="mt-1">{t("chargebacks.flowBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NoteField({ valueRef, required }: { valueRef: MutableRefObject<{ note: string }>; required: boolean }) {
  const t = useT();
  const { update } = useConfirm();
  const [note, setNote] = useState("");
  useEffect(() => {
    valueRef.current = { note };
    update({ confirmDisabled: required && note.trim().length === 0 });
  }, [note, required, update, valueRef]);
  return (
    <div>
      <label htmlFor="cb-note-field" className="label">
        {t("chargebacks.evidence")}
      </label>
      <textarea id="cb-note-field" className="input min-h-[80px]" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}
