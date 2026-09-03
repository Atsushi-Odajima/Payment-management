"use client";

// Announcement detail: contents, window, audience, publish / end, and the
// incident timeline with an "add update" form.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { AnnouncementKindBadge, AnnouncementStatusBadge } from "@/components/announcement-banner";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import type { AnnouncementRow } from "@/lib/announcements/list";
import { INCIDENT_PHASES, type IncidentPhase } from "@/lib/announcements/types";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PHASE_CLASS: Record<IncidentPhase, string> = {
  occurred: "bg-rose-100 text-rose-800 ring-rose-200",
  investigating: "bg-amber-100 text-amber-800 ring-amber-200",
  resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export function AnnouncementDetailView({ announcement: a, merchantNames }: { announcement: AnnouncementRow; merchantNames: Record<string, string> }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<IncidentPhase>(a.updates.length ? "investigating" : "occurred");
  const [updateBody, setUpdateBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function status(action: "publish" | "end") {
    const ok = await confirm({ title: t(`announcements.actions.${action}` as MessageKey), body: t(`announcements.confirm.${action}` as MessageKey, { title: a.title }), confirmLabel: t(`announcements.actions.${action}` as MessageKey), tone: action === "end" ? "danger" : "primary" });
    if (!ok) return;
    setBusy(action);
    const res = await apiJson(`/api/announcements/${a.id}/${action}`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(`announcements.done.${action}` as MessageKey));
    router.refresh();
  }

  async function addUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy("update");
    setError(null);
    const res = await apiJson(`/api/announcements/${a.id}/update`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase, body: updateBody }) });
    setBusy(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setUpdateBody("");
    toast.show(t("announcements.updateAdded"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={a.title}
        description={t(`announcementEnums.kind.${a.kind}` as MessageKey)}
        helpHref="/manual/announcements"
        breadcrumbs={[{ label: t("announcements.title"), href: "/announcements" }, { label: a.title }]}
        actions={
          <>
            <AnnouncementKindBadge kind={a.kind} />
            <AnnouncementStatusBadge status={a.status} />
            {a.active && <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">{t("announcements.activeBadge")}</span>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="an-heading">
            <h2 id="an-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("announcements.sectionContent")}
            </h2>
            <div className="px-5 py-4 text-sm">
              <p className="whitespace-pre-wrap text-slate-800">{a.body}</p>
            </div>
            <DetailRow label={t("announcements.publishFrom")}>{formatDate(a.publishFrom)}</DetailRow>
            <DetailRow label={t("announcements.publishUntil")}>{a.publishUntil ? formatDate(a.publishUntil) : "—"}</DetailRow>
            <DetailRow label={t("announcements.thAudience")}>
              {a.targetAll ? (
                t("announcements.audienceAll")
              ) : (
                <span className="flex flex-wrap justify-end gap-1">
                  {a.targetMerchantIds.map((id) => (
                    <span key={id} className="badge bg-slate-100 text-slate-700 ring-slate-200">
                      {merchantNames[id] ?? id}
                    </span>
                  ))}
                </span>
              )}
            </DetailRow>
            <DetailRow label={t("announcements.updatedAt")}>{formatDate(a.updatedAt)}</DetailRow>
          </section>

          {a.kind === "incident" && (
            <section className="card" aria-labelledby="an-timeline">
              <h2 id="an-timeline" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
                {t("announcements.timeline")}
              </h2>
              {a.updates.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">{t("announcements.noUpdates")}</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {a.updates.map((u) => (
                    <li key={u.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={cn("badge", PHASE_CLASS[u.phase])}>{t(`announcementEnums.phase.${u.phase}` as MessageKey)}</span>
                        <span className="text-xs text-slate-500">{formatDate(u.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-800">{u.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              <form onSubmit={addUpdate} className="space-y-3 border-t border-slate-100 p-5" aria-busy={busy === "update"}>
                <p className="text-xs font-medium text-slate-600">{t("announcements.addUpdate")}</p>
                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <select className="input" value={phase} onChange={(e) => setPhase(e.target.value as IncidentPhase)} aria-label={t("announcements.phase")}>
                    {INCIDENT_PHASES.map((p) => (
                      <option key={p} value={p}>
                        {t(`announcementEnums.phase.${p}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                  <input className="input" value={updateBody} onChange={(e) => setUpdateBody(e.target.value)} maxLength={2000} placeholder={t("announcements.updatePlaceholder")} required aria-label={t("announcements.updateBody")} />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-secondary" disabled={busy !== null || !updateBody.trim()}>
                    {t("announcements.addUpdate")}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy !== null}>
              {a.status !== "published" && (
                <button type="button" className="btn-primary w-full" disabled={busy !== null} onClick={() => status("publish")}>
                  {t("announcements.actions.publish")}
                </button>
              )}
              {a.status === "published" && (
                <button type="button" className="btn-danger w-full" disabled={busy !== null} onClick={() => status("end")}>
                  {t("announcements.actions.end")}
                </button>
              )}
              <Link href={`/announcements/${a.id}/edit`} className="btn-secondary flex w-full justify-center">
                {t("announcements.edit")}
              </Link>
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("announcements.bannerTitle")}</p>
            <p className="mt-1">{t("announcements.bannerBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
