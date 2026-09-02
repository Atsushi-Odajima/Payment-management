"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MutableRefObject, useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { ApplicationStatusBadge } from "@/components/application-status-badge";
import { DetailRow } from "@/components/ui/detail-row";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useRole } from "@/components/role-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import {
  DECISIONS_REQUIRING_REASON,
  canReview,
  type ApplicationStatus,
  type ApplicationView,
  type ReviewDecision,
} from "@/lib/applications/types";

export function ApplicationDetailView({ application: initial }: { application: ApplicationView }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { isMaster } = useRole();
  const formatDate = useFormatDateTime();
  const [app, setApp] = useState(initial);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef("");

  async function decide(decision: ReviewDecision) {
    setError(null);
    reasonRef.current = "";
    const needsReason = DECISIONS_REQUIRING_REASON.includes(decision);
    const ok = await confirm({
      title: t(`applicationDetail.decision_${decision}`),
      body: t(`applicationDetail.confirm_${decision}`, { code: app.applicationCode }),
      confirmLabel: t(`applicationDetail.decision_${decision}`),
      tone: decision === "approve" ? "primary" : "danger",
      confirmDisabled: needsReason,
      fields: needsReason ? <ReasonField valueRef={reasonRef} /> : undefined,
    });
    if (!ok) return;
    setBusy(decision);
    const res = await apiJson<{ status: ApplicationStatus; reviewedAt: string }>(`/api/applications/${app.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, reason: reasonRef.current || null }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setApp((a) => ({ ...a, status: res.data.status, reviewedAt: new Date(res.data.reviewedAt), reviewerNote: reasonRef.current || null }));
    toast.show(t(`applicationDetail.done_${decision}`));
    router.refresh();
  }

  const reviewable = canReview(app.status);

  return (
    <div>
      <PageHeader
        title={t("applicationDetail.title", { code: app.applicationCode })}
        description={`${app.merchant.merchantCode} · ${app.merchant.siteName}`}
        helpHref="/manual/applications"
        breadcrumbs={[{ label: t("applications.title"), href: "/applications" }, { label: app.applicationCode }]}
        actions={<ApplicationStatusBadge status={app.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="app-request">
            <h2 id="app-request" className="px-5 py-3 text-sm font-semibold text-slate-800">{t("applicationDetail.sectionRequest")}</h2>
            <DetailRow label={t("applications.thMerchant")}>
              <Link href={`/merchants/${app.merchant.id}`} className="text-brand-700 hover:underline">
                {app.merchant.merchantCode} — {app.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("applications.thType")}>{t(`applicationEnums.type.${app.type}`)}</DetailRow>
            <DetailRow label={t("applications.thMethod")}>{t(`applicationEnums.method.${app.method}`)}</DetailRow>
            <DetailRow label={t("applications.thAppliedAt")}>{formatDate(app.appliedAt)}</DetailRow>
            <div className="px-5 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("applicationDetail.note")}</p>
              <p className="whitespace-pre-wrap text-slate-800">{app.note || "—"}</p>
            </div>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="app-review">
            <h2 id="app-review" className="px-5 py-3 text-sm font-semibold text-slate-800">{t("applicationDetail.sectionReview")}</h2>
            <DetailRow label={t("applications.thStatus")}><ApplicationStatusBadge status={app.status} /></DetailRow>
            <DetailRow label={t("applications.thReviewedAt")}>{app.reviewedAt ? formatDate(app.reviewedAt) : "—"}</DetailRow>
            <div className="px-5 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("applicationDetail.reviewerNote")}</p>
              <p className="whitespace-pre-wrap text-slate-800">{app.reviewerNote || "—"}</p>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-4" aria-busy={busy !== null}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("applicationDetail.actions")}</p>
            {!reviewable ? (
              <p className="mt-3 text-xs text-slate-500">{t("applicationDetail.alreadyReviewed")}</p>
            ) : !isMaster ? (
              <p className="mt-3 text-xs text-slate-500">{t("applicationDetail.masterOnly")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <button type="button" className="btn-primary w-full" disabled={busy !== null} onClick={() => decide("approve")}>
                  {busy === "approve" ? t("common.processing") : t("applicationDetail.decision_approve")}
                </button>
                <button type="button" className="btn-secondary w-full" disabled={busy !== null} onClick={() => decide("return")}>
                  {busy === "return" ? t("common.processing") : t("applicationDetail.decision_return")}
                </button>
                <button type="button" className="btn-danger w-full" disabled={busy !== null} onClick={() => decide("reject")}>
                  {busy === "reject" ? t("common.processing") : t("applicationDetail.decision_reject")}
                </button>
                <p className="text-[11px] text-slate-400">{t("applicationDetail.approveHint")}</p>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReasonField({ valueRef }: { valueRef: MutableRefObject<string> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  useEffect(() => {
    valueRef.current = reason;
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, update, valueRef]);
  return (
    <div>
      <label htmlFor="review-reason" className="label">
        {t("applicationDetail.reason")} <span className="text-rose-600">*</span>
      </label>
      <textarea id="review-reason" className="input min-h-[90px]" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <p className="help">{t("applicationDetail.reasonHelp")}</p>
    </div>
  );
}
