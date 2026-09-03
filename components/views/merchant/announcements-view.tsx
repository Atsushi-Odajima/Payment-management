"use client";

import { useFormatDateTime, useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface MerchantAnnouncement {
  id: string;
  kind: string;
  title: string;
  body: string;
  publishFrom: Date;
  updates: Array<{ id: string; phase: string; body: string; createdAt: Date }>;
}

const KIND_CLASS: Record<string, string> = { notice: "bg-sky-100 text-sky-800 ring-sky-200", maintenance: "bg-amber-100 text-amber-800 ring-amber-200", incident: "bg-rose-100 text-rose-800 ring-rose-200" };

export function MerchantAnnouncementsView({ rows }: { rows: MerchantAnnouncement[] }) {
  const t = useT();
  const formatDate = useFormatDateTime();
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.announcements.title")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.announcements.description")}</p>
      {rows.length === 0 ? (
        <p className="card mt-4 px-5 py-10 text-center text-sm text-slate-500">{t("merchantPortal.announcements.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((a) => (
            <li key={a.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("badge", KIND_CLASS[a.kind] ?? KIND_CLASS.notice)}>{t(`announcementEnums.kind.${a.kind}` as MessageKey)}</span>
                <h2 className="text-sm font-semibold text-slate-900">{a.title}</h2>
                <span className="text-xs text-slate-500">{formatDate(a.publishFrom)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
              {a.updates.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("merchantPortal.announcements.updates")}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {a.updates.map((u) => (
                      <li key={u.id}>
                        <span className="text-xs text-slate-500">{formatDate(u.createdAt)}</span> <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{t(`announcementEnums.phase.${u.phase}` as MessageKey)}</span> <span className="text-slate-700">{u.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
