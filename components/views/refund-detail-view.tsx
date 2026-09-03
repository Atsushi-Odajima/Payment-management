"use client";

// Refund request detail: what was requested, by whom, and the master's
// approve / reject actions while the request is pending.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { RefundStatusBadge } from "@/components/refund-badges";
import { ModeBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useRole } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { RefundRow } from "@/lib/refunds/list";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function RefundDetailView({ refund }: { refund: RefundRow }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { isMaster } = useRole();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<{ note: string }>({ note: "" });
  const pending = refund.status === "requested";

  async function decide(action: "approve" | "reject") {
    noteRef.current = { note: "" };
    const ok = await confirm({
      title: t(`refunds.${action}`),
      body: t(`refunds.${action}Body`, { amount: formatYen(refund.amount), orderNumber: refund.orderNumber }),
      confirmLabel: t(`refunds.${action}`),
      tone: action === "reject" ? "danger" : "primary",
      fields: <NoteField valueRef={noteRef} />,
    });
    if (!ok) return;
    setBusy(action);
    setError(null);
    const res = await apiJson(`/api/refunds/${refund.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: noteRef.current.note }) });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(action === "approve" ? "refunds.approved" : "refunds.rejected"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("refunds.detailTitle", { orderNumber: refund.orderNumber })}
        description={`${formatYen(refund.amount)} · ${t(`refundEnums.kind.${refund.kind}` as MessageKey)}`}
        helpHref="/manual/refunds"
        breadcrumbs={[{ label: t("refunds.title"), href: "/refunds" }, { label: refund.id }]}
        actions={
          <>
            <ModeBadge live={refund.livemode} />
            <RefundStatusBadge status={refund.status} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card divide-y divide-slate-100" aria-labelledby="refund-heading">
          <h2 id="refund-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
            {t("refunds.sectionRefund")}
          </h2>
          <DetailRow label={t("refunds.payment")}>
            <Link href={`/payments/${refund.paymentId}`} className="text-brand-700 hover:underline">
              {refund.orderNumber}
            </Link>
            <span className="ml-2 font-mono text-xs text-slate-500">{refund.paymentId}</span>
          </DetailRow>
          <DetailRow label={t("refunds.thMerchant")}>
            {refund.merchant ? (
              <Link href={`/merchants/${refund.merchant.id}`} className="text-brand-700 hover:underline">
                {refund.merchant.merchantCode} — {refund.merchant.siteName}
              </Link>
            ) : (
              "—"
            )}
          </DetailRow>
          <DetailRow label={t("refunds.amount")}>
            <span className="text-lg font-semibold tabular-nums">{formatYen(refund.amount)}</span>
            <span className="ml-2 text-xs text-slate-500">/ {formatYen(refund.paymentAmount)}</span>
          </DetailRow>
          <DetailRow label={t("refunds.kind")}>{t(`refundEnums.kind.${refund.kind}` as MessageKey)}</DetailRow>
          <DetailRow label={t("refunds.reason")}>
            {t(`refundEnums.reason.${refund.reasonCode}` as MessageKey)}
            {refund.forced && <span className="badge ml-2 bg-rose-100 text-rose-800 ring-rose-200">{t("refunds.forcedBadge")}</span>}
          </DetailRow>
          <DetailRow label={t("refunds.reasonText")}>
            <span className="whitespace-pre-wrap">{refund.reason || "—"}</span>
          </DetailRow>
          <DetailRow label={t("refunds.status")}>
            <RefundStatusBadge status={refund.status} />
          </DetailRow>
          <DetailRow label={t("refunds.requestedBy")}>{refund.requestedBy ? `${refund.requestedBy.name} (${refund.requestedBy.loginId})` : t("refunds.systemActor")}</DetailRow>
          <DetailRow label={t("refunds.requestedAt")}>{formatDate(refund.createdAt)}</DetailRow>
          <DetailRow label={t("refunds.approvedBy")}>{refund.approvedBy ? `${refund.approvedBy.name} (${refund.approvedBy.loginId})` : "—"}</DetailRow>
          <DetailRow label={t("refunds.completedAt")}>{refund.completedAt ? formatDate(refund.completedAt) : "—"}</DetailRow>
          <DetailRow label={t("refunds.decisionNote")}>
            <span className="whitespace-pre-wrap">{refund.decisionNote || "—"}</span>
          </DetailRow>
        </section>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy !== null}>
              {pending ? (
                <>
                  <button type="button" className="btn-primary w-full" disabled={!isMaster || busy !== null} onClick={() => decide("approve")}>
                    {busy === "approve" ? t("common.processing") : t("refunds.approve")}
                  </button>
                  <button type="button" className="btn-danger w-full" disabled={!isMaster || busy !== null} onClick={() => decide("reject")}>
                    {busy === "reject" ? t("common.processing") : t("refunds.reject")}
                  </button>
                  {!isMaster && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("refunds.masterOnly")}</p>}
                </>
              ) : (
                <p className="text-xs text-slate-500">{t("refunds.noActions")}</p>
              )}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NoteField({ valueRef }: { valueRef: MutableRefObject<{ note: string }> }) {
  const t = useT();
  const [note, setNote] = useState("");
  useEffect(() => {
    valueRef.current = { note };
  }, [note, valueRef]);
  return (
    <div>
      <label htmlFor="refund-note" className="label">
        {t("refunds.decisionNote")}
      </label>
      <input id="refund-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
  );
}
