"use client";

// One timeline for a transaction (Phase I-2): status-change events and
// internal notes merged by time. Staff can add notes, authors edit their own,
// admins delete (audited), admin / cs pin. Notes never leave the dashboard.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useRole, useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { PaymentEventItem } from "@/lib/payments/detail";
import type { NoteRow } from "@/lib/payments/notes";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

type Entry = { at: Date; kind: "event"; event: PaymentEventItem } | { at: Date; kind: "note"; note: NoteRow };

export function PinIcon({ className, "aria-label": label }: { className?: string; "aria-label"?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden={label ? undefined : "true"} aria-label={label} role={label ? "img" : undefined} className={cn("h-4 w-4", className)}>
      <path d="M12.5 2.5l5 5-3.2 1.3-2.6 4.4 1.3 1.3-1.4 1.4-3.2-3.2L4 17l-1-1 4.3-4.4-3.2-3.2 1.4-1.4 1.3 1.3 4.4-2.6L12.5 2.5z" />
    </svg>
  );
}

export function PaymentTimeline({
  paymentId,
  events,
  notes: initialNotes,
  eventLabel,
  statusLabel,
  actorLabel,
}: {
  paymentId: string;
  events: PaymentEventItem[];
  notes: NoteRow[];
  eventLabel: (type: string) => string;
  statusLabel: (status: string) => string;
  actorLabel: (actor: string) => string;
}) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { user } = useSession();
  const { can } = useRole();
  const formatDate = useFormatDateTime();
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [draftPinned, setDraftPinned] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate = can("payment_note", "create");
  const canPin = can("payment_note", "pin");
  const canDelete = can("payment_note", "delete");

  const entries: Entry[] = [...events.map((e) => ({ at: e.createdAt, kind: "event" as const, event: e })), ...notes.map((n) => ({ at: n.createdAt, kind: "note" as const, note: n }))].sort((a, b) => a.at.getTime() - b.at.getTime());
  const pinned = notes.filter((n) => n.pinned);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const res = await apiJson<NoteRow>(`/api/payments/${paymentId}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: draft, pinned: draftPinned }) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setNotes((n) => [...n, { ...res.data, createdAt: new Date(res.data.createdAt), editedAt: res.data.editedAt ? new Date(res.data.editedAt) : null }]);
    setDraft("");
    setDraftPinned(false);
    toast.show(t("notes.added"));
    router.refresh();
  }

  async function patch(note: NoteRow, data: { body?: string; pinned?: boolean }) {
    setBusy(true);
    const res = await apiJson<NoteRow>(`/api/payments/${paymentId}/notes/${note.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setNotes((n) => n.map((x) => (x.id === note.id ? { ...res.data, createdAt: new Date(res.data.createdAt), editedAt: res.data.editedAt ? new Date(res.data.editedAt) : null } : x)));
    setEditing(null);
    toast.show(t(data.body !== undefined ? "notes.edited" : data.pinned ? "notes.pinned" : "notes.unpinned"));
    router.refresh();
  }

  async function remove(note: NoteRow) {
    const ok = await confirm({ title: t("notes.delete"), body: t("notes.deleteConfirm"), confirmLabel: t("notes.delete"), tone: "danger" });
    if (!ok) return;
    setBusy(true);
    const res = await apiJson(`/api/payments/${paymentId}/notes/${note.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setNotes((n) => n.filter((x) => x.id !== note.id));
    toast.show(t("notes.deleted"));
    router.refresh();
  }

  return (
    <section className="card" aria-labelledby="timeline-heading">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id="timeline-heading" className="text-sm font-semibold text-slate-900">
          {t("notes.timeline")}
        </h2>
        <span className="text-xs text-slate-500">{t("notes.count", { events: events.length, notes: notes.length })}</span>
      </div>
      {pinned.length > 0 && (
        <ul className="divide-y divide-amber-100 border-b border-amber-100 bg-amber-50/60" aria-label={t("notes.pinnedNotes")}>
          {pinned.map((n) => (
            <li key={n.id} className="flex items-start gap-2 px-5 py-2 text-sm text-amber-900">
              <PinIcon className="mt-0.5 shrink-0 text-amber-600" />
              <span className="whitespace-pre-wrap">{n.body}</span>
            </li>
          ))}
        </ul>
      )}
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">{t("paymentDetail.noEvents")}</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {entries.map((entry) =>
            entry.kind === "event" ? (
              <li key={`e-${entry.event.id}`} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {eventLabel(entry.event.type)}
                    {entry.event.toStatus && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {entry.event.fromStatus ? `${statusLabel(entry.event.fromStatus)} → ` : ""}
                        {statusLabel(entry.event.toStatus)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {actorLabel(entry.event.actor)} · {formatDate(entry.event.createdAt)}
                  </p>
                </div>
                {entry.event.amount != null && <span className="tabular-nums text-xs text-slate-600">{formatYen(entry.event.amount)}</span>}
              </li>
            ) : (
              <li key={`n-${entry.note.id}`} className={cn("px-5 py-3 text-sm", entry.note.pinned && "bg-amber-50/40")} data-note-id={entry.note.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{t("notes.badge")}</span>
                      <span className="font-medium text-slate-700">{entry.note.author.name}</span>
                      <span>· {formatDate(entry.note.createdAt)}</span>
                      {entry.note.editedAt && <span>· {t("notes.editedAt", { at: formatDate(entry.note.editedAt) })}</span>}
                      {entry.note.pinned && <PinIcon className="text-amber-600" />}
                    </p>
                    {editing?.id === entry.note.id ? (
                      <form
                        className="mt-2 space-y-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void patch(entry.note, { body: editing.body });
                        }}
                      >
                        <textarea className="input min-h-[72px]" value={editing.body} onChange={(e) => setEditing({ id: entry.note.id, body: e.target.value })} maxLength={2000} />
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary px-2 py-1 text-xs" disabled={busy || !editing.body.trim()}>
                            {t("notes.save")}
                          </button>
                          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditing(null)}>
                            {t("common.cancel")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-slate-800">{entry.note.body}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {user?.id === entry.note.author.id && editing?.id !== entry.note.id && (
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => setEditing({ id: entry.note.id, body: entry.note.body })}>
                        {t("notes.edit")}
                      </button>
                    )}
                    {canPin && (
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => patch(entry.note, { pinned: !entry.note.pinned })}>
                        {entry.note.pinned ? t("notes.unpin") : t("notes.pin")}
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="btn-danger px-2 py-1 text-xs" disabled={busy} onClick={() => remove(entry.note)}>
                        {t("notes.delete")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
      {canCreate && (
        <form onSubmit={submit} className="space-y-2 border-t border-slate-100 px-5 py-4" aria-label={t("notes.add")}>
          <label htmlFor="note-body" className="label">
            {t("notes.add")}
          </label>
          <textarea id="note-body" className="input min-h-[72px]" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder={t("notes.placeholder")} />
          <div className="flex items-center justify-between gap-2">
            {canPin ? (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={draftPinned} onChange={(e) => setDraftPinned(e.target.checked)} />
                {t("notes.pinOnCreate")}
              </label>
            ) : (
              <span />
            )}
            <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !draft.trim()}>
              {busy ? t("common.processing") : t("notes.post")}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">{t("notes.internalOnly")}</p>
        </form>
      )}
    </section>
  );
}

export function noteLabelKey(key: string): MessageKey {
  return key as MessageKey;
}
