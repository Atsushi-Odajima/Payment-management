"use client";

// Announcement badges. Active maintenance / incident announcements are pinned
// at the top of the header bell (components/notification-bell.tsx) instead of
// a page-wide banner; merchants get the same list through /api/merchant-api/announcements.

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

/** Active maintenance / incident announcements worth pinning (notices are list-only). */
export function pinnedAnnouncements(items: BannerItem[]): BannerItem[] {
  return items.filter((i) => i.kind !== "notice").slice(0, 3);
}
