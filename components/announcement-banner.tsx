"use client";

// Announcement badges and the header banner. The banner shows the active
// incident (red) or maintenance (yellow) announcements to everyone who opens
// the dashboard; merchants get the same list through /api/merchant-api/announcements.

import Link from "next/link";
import { useT } from "@/components/language-provider";
import type { AnnouncementKind, AnnouncementStatus } from "@/lib/announcements/types";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface BannerItem {
  id: string;
  kind: AnnouncementKind;
  title: string;
  latestPhase: string | null;
}

const KIND_CLASS: Record<AnnouncementKind, string> = {
  notice: "bg-sky-100 text-sky-800 ring-sky-200",
  maintenance: "bg-amber-100 text-amber-800 ring-amber-200",
  incident: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function AnnouncementKindBadge({ kind }: { kind: AnnouncementKind }) {
  const t = useT();
  return <span className={cn("badge", KIND_CLASS[kind])}>{t(`announcementEnums.kind.${kind}` as MessageKey)}</span>;
}

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  published: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  ended: "bg-slate-200 text-slate-600 ring-slate-300",
};

export function AnnouncementStatusBadge({ status }: { status: AnnouncementStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status])}>{t(`announcementEnums.status.${status}` as MessageKey)}</span>;
}

export function AnnouncementBanner({ items }: { items: BannerItem[] }) {
  const t = useT();
  const shown = items.filter((i) => i.kind !== "notice").slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-px" role="region" aria-label={t("announcements.bannerLabel")}>
      {shown.map((i) => (
        <Link
          key={i.id}
          href={`/announcements/${i.id}`}
          className={cn("flex items-center gap-3 px-4 py-2 text-xs md:px-6", i.kind === "incident" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-amber-400 text-amber-950 hover:bg-amber-500")}
        >
          <span className="font-semibold uppercase tracking-wide">{t(`announcementEnums.kind.${i.kind}` as MessageKey)}</span>
          <span className="truncate">{i.title}</span>
          {i.latestPhase && <span className="ml-auto shrink-0 rounded bg-white/20 px-1.5 py-0.5">{t(`announcementEnums.phase.${i.latestPhase}` as MessageKey)}</span>}
        </Link>
      ))}
    </div>
  );
}
