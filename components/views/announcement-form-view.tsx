"use client";

// Create / edit an announcement: kind, title, body, publish window, audience.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import type { AnnouncementRow } from "@/lib/announcements/list";
import { ANNOUNCEMENT_KINDS, type AnnouncementKind } from "@/lib/announcements/types";
import type { MessageKey } from "@/lib/i18n";

export interface MerchantChoice {
  id: string;
  merchantCode: string;
  siteName: string;
}

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const p = new Date(d.getTime() + 9 * 3_600_000); // Asia/Tokyo wall time
  return p.toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string {
  return v ? new Date(`${v}:00+09:00`).toISOString() : "";
}

export function AnnouncementFormView({ merchants, initial }: { merchants: MerchantChoice[]; initial?: AnnouncementRow }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [kind, setKind] = useState<AnnouncementKind>(initial?.kind ?? "notice");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  // Default "now" is filled on the client only, so server and client markup match.
  const [publishFrom, setPublishFrom] = useState(initial ? toLocalInput(initial.publishFrom) : "");
  useEffect(() => {
    if (!initial) setPublishFrom((v) => v || toLocalInput(new Date()));
  }, [initial]);
  const [publishUntil, setPublishUntil] = useState(toLocalInput(initial?.publishUntil ?? null));
  const [targetAll, setTargetAll] = useState(initial?.targetAll ?? true);
  const [targets, setTargets] = useState<string[]>(initial?.targetMerchantIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(publish: boolean) {
    setBusy(true);
    setError(null);
    const payload = { kind, title, body, publishFrom: fromLocalInput(publishFrom), publishUntil: fromLocalInput(publishUntil), targetAll, targetMerchantIds: targets, publish };
    const res = initial
      ? await apiJson<{ id: string }>(`/api/announcements/${initial.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await apiJson<{ id: string }>("/api/announcements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t(initial ? "announcements.updated" : publish ? "announcements.published" : "announcements.savedDraft"));
    router.push(`/announcements/${res.data.id}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={initial ? t("announcements.editTitle") : t("announcements.newTitle")}
        description={t("announcements.formHelp")}
        helpHref="/manual/announcements"
        breadcrumbs={[{ label: t("announcements.title"), href: "/announcements" }, { label: initial ? initial.title : t("announcements.newTitle") }]}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="card max-w-3xl space-y-5 p-6"
        aria-busy={busy}
      >
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <FormField id="an-kind" label={t("announcements.thKind")}>
            <select id="an-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as AnnouncementKind)}>
              {ANNOUNCEMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`announcementEnums.kind.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="an-title" label={t("announcements.thTitle")} required>
            <input id="an-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          </FormField>
        </div>
        <FormField id="an-body" label={t("announcements.body")} required help={kind === "incident" ? t("announcements.incidentHelp") : undefined}>
          <textarea id="an-body" className="input min-h-[160px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="an-from" label={t("announcements.publishFrom")} required>
            <input id="an-from" type="datetime-local" className="input" value={publishFrom} onChange={(e) => setPublishFrom(e.target.value)} required />
          </FormField>
          <FormField id="an-until" label={t("announcements.publishUntil")} help={t("announcements.publishUntilHelp")}>
            <input id="an-until" type="datetime-local" className="input" value={publishUntil} onChange={(e) => setPublishUntil(e.target.value)} />
          </FormField>
        </div>
        <div>
          <p className="label">{t("announcements.thAudience")}</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="audience" checked={targetAll} onChange={() => setTargetAll(true)} />
            {t("announcements.audienceAll")}
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="audience" checked={!targetAll} onChange={() => setTargetAll(false)} />
            {t("announcements.audiencePick")}
          </label>
          {!targetAll && (
            <ul className="mt-2 grid gap-1 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
              {merchants.map((m) => (
                <li key={m.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={targets.includes(m.id)} onChange={(e) => setTargets((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))} />
                    <span className="font-mono text-xs text-slate-500">{m.merchantCode}</span>
                    {m.siteName}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="submit" className="btn-secondary" disabled={busy}>
            {initial ? t("announcements.saveChanges") : t("announcements.saveDraft")}
          </button>
          {!initial && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => submit(true)}>
              {t("announcements.publishNow")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
