// Announcement loaders: admin list / detail and the "active for this
// audience" query used by the banner and the merchant API.

import { prisma } from "@/lib/db";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { ANNOUNCEMENT_SELECT } from "./service";
import { isAnnouncementKind, isAnnouncementStatus, isIncidentPhase, parseTargetIds, type AnnouncementKind, type AnnouncementStatus, type IncidentPhase } from "./types";

export interface AnnouncementUpdateRow {
  id: string;
  phase: IncidentPhase;
  body: string;
  createdAt: Date;
}

export interface AnnouncementRow {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  publishFrom: Date;
  publishUntil: Date | null;
  targetAll: boolean;
  targetMerchantIds: string[];
  status: AnnouncementStatus;
  /** Published and inside its window right now. */
  active: boolean;
  updates: AnnouncementUpdateRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnouncementFilters {
  kind: AnnouncementKind | "";
  status: AnnouncementStatus | "";
}

export const ANNOUNCEMENT_SORT_KEYS = ["publishFrom", "kind", "status", "updatedAt"] as const;

export function parseAnnouncementFilters(q: QueryParams | undefined): AnnouncementFilters {
  return { kind: isAnnouncementKind(q?.kind) ? q!.kind! : "", status: isAnnouncementStatus(q?.status) ? q!.status! : "" };
}

export function parseAnnouncementSort(q: QueryParams | undefined): SortState {
  return parseSort(q, ANNOUNCEMENT_SORT_KEYS, { key: "publishFrom", dir: "desc" });
}

type Raw = {
  id: string;
  kind: string;
  title: string;
  body: string;
  publishFrom: Date;
  publishUntil: Date | null;
  targetAll: boolean;
  targetMerchantIds: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  updates: { id: string; phase: string; body: string; createdAt: Date }[];
};

export function isActive(a: { status: string; publishFrom: Date; publishUntil: Date | null }, now: Date): boolean {
  return a.status === "published" && a.publishFrom.getTime() <= now.getTime() && (a.publishUntil === null || a.publishUntil.getTime() > now.getTime());
}

export function toAnnouncementRow(r: Raw, now: Date = new Date()): AnnouncementRow {
  return {
    id: r.id,
    kind: isAnnouncementKind(r.kind) ? r.kind : "notice",
    title: r.title,
    body: r.body,
    publishFrom: r.publishFrom,
    publishUntil: r.publishUntil,
    targetAll: r.targetAll,
    targetMerchantIds: parseTargetIds(r.targetMerchantIds),
    status: isAnnouncementStatus(r.status) ? r.status : "draft",
    active: isActive(r, now),
    updates: r.updates.map((u) => ({ id: u.id, phase: isIncidentPhase(u.phase) ? u.phase : "occurred", body: u.body, createdAt: u.createdAt })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function loadAnnouncements(opts: { filters: AnnouncementFilters; sort: SortState; page: number; pageSize: number }) {
  const where = { ...(opts.filters.kind ? { kind: opts.filters.kind } : {}), ...(opts.filters.status ? { status: opts.filters.status } : {}) };
  const [rows, total, merchants] = await Promise.all([
    prisma.announcement.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: ANNOUNCEMENT_SELECT }),
    prisma.announcement.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);
  return { rows: rows.map((r) => toAnnouncementRow(r)), total, merchants };
}

export async function loadAnnouncement(id: string): Promise<AnnouncementRow | null> {
  const r = await prisma.announcement.findUnique({ where: { id }, select: ANNOUNCEMENT_SELECT });
  return r ? toAnnouncementRow(r) : null;
}

/** Published announcements inside their window, optionally narrowed to one merchant's audience. */
export async function loadActiveAnnouncements(merchantId: string | null = null, now: Date = new Date()): Promise<AnnouncementRow[]> {
  const rows = await prisma.announcement.findMany({
    where: { status: "published", publishFrom: { lte: now }, OR: [{ publishUntil: null }, { publishUntil: { gt: now } }] },
    orderBy: [{ publishFrom: "desc" }],
    take: 50,
    select: ANNOUNCEMENT_SELECT,
  });
  return rows.map((r) => toAnnouncementRow(r, now)).filter((a) => a.targetAll || merchantId === null || a.targetMerchantIds.includes(merchantId));
}
