// Read side of the notification centre (Phase J): visibility by role, list
// with filters, unread count, read marks and per-admin preferences.

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDateInTz, nextDayInTz } from "@/lib/time";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { normalizeRole, type Role } from "@/lib/role";
import { NOTIFICATION_KINDS, isNotificationKind, isNotificationSeverity, type NotificationFilters, type NotificationKind, type NotificationRow, type PreferenceRow } from "./types";

export const NOTIFICATION_SORT_KEYS = ["createdAt", "severity", "kind"] as const;

export function parseNotificationFilters(q: QueryParams | undefined): NotificationFilters {
  return {
    kind: isNotificationKind(q?.kind) ? q!.kind! : "",
    severity: isNotificationSeverity(q?.severity) ? q!.severity! : "",
    read: q?.read === "unread" || q?.read === "read" ? q.read : "",
    from: q?.from && parseDateInTz(q.from) ? q.from : "",
    to: q?.to && parseDateInTz(q.to) ? q.to : "",
  };
}

export function parseNotificationSort(q: QueryParams | undefined): SortState {
  return parseSort(q, NOTIFICATION_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

/** Rows the admin may see: role list empty, or containing the admin's role (stored as a JSON array). */
function visibleWhere(role: Role) {
  return { OR: [{ roles: "[]" }, { roles: { contains: `"${role}"` } }] };
}

type Raw = { id: string; kind: string; severity: string; title: string; body: string; href: string | null; roles: string; targetType: string | null; targetId: string | null; createdAt: Date; reads: { readAt: Date }[] };

function toRow(r: Raw): NotificationRow {
  return {
    id: r.id,
    kind: isNotificationKind(r.kind) ? r.kind : "batch.failed",
    severity: isNotificationSeverity(r.severity) ? r.severity : "info",
    title: r.title,
    body: r.body,
    href: r.href,
    roles: (JSON.parse(r.roles || "[]") as string[]).map(normalizeRole),
    targetType: r.targetType,
    targetId: r.targetId,
    createdAt: r.createdAt,
    readAt: r.reads[0]?.readAt ?? null,
  };
}

const SELECT = (adminId: string) => ({ id: true, kind: true, severity: true, title: true, body: true, href: true, roles: true, targetType: true, targetId: true, createdAt: true, reads: { where: { adminUserId: adminId }, select: { readAt: true } } }) as const;

export async function loadNotifications(db: PrismaClient, opts: { admin: { id: string; role: Role }; filters: NotificationFilters; sort: SortState; page: number; pageSize: number }) {
  const f = opts.filters;
  const from = f.from ? parseDateInTz(f.from) : null;
  const to = f.to ? nextDayInTz(parseDateInTz(f.to)!) : null;
  const where = {
    ...visibleWhere(opts.admin.role),
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.severity ? { severity: f.severity } : {}),
    ...(f.read === "unread" ? { reads: { none: { adminUserId: opts.admin.id } } } : f.read === "read" ? { reads: { some: { adminUserId: opts.admin.id } } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: SELECT(opts.admin.id) }),
    db.notification.count({ where }),
    unreadCount(db, opts.admin),
  ]);
  return { rows: rows.map(toRow), total, unread };
}

export async function unreadCount(db: PrismaClient, admin: { id: string; role: Role }): Promise<number> {
  return db.notification.count({ where: { ...visibleWhere(admin.role), reads: { none: { adminUserId: admin.id } } } });
}

/** The bell dropdown: the newest rows (read or not) plus the unread count. */
export async function latestNotifications(db: PrismaClient, admin: { id: string; role: Role }, limit = 10): Promise<{ rows: NotificationRow[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: visibleWhere(admin.role), orderBy: { createdAt: "desc" }, take: limit, select: SELECT(admin.id) }),
    unreadCount(db, admin),
  ]);
  return { rows: rows.map(toRow), unread };
}

export async function markRead(db: PrismaClient, admin: { id: string; role: Role }, notificationId: string): Promise<boolean> {
  const n = await db.notification.findFirst({ where: { id: notificationId, ...visibleWhere(admin.role) }, select: { id: true } });
  if (!n) return false;
  await db.notificationRead.upsert({ where: { notificationId_adminUserId: { notificationId, adminUserId: admin.id } }, update: {}, create: { notificationId, adminUserId: admin.id } });
  return true;
}

export async function markAllRead(db: PrismaClient, admin: { id: string; role: Role }): Promise<number> {
  const unread = await db.notification.findMany({ where: { ...visibleWhere(admin.role), reads: { none: { adminUserId: admin.id } } }, select: { id: true } });
  if (unread.length === 0) return 0;
  await db.notificationRead.createMany({ data: unread.map((n) => ({ notificationId: n.id, adminUserId: admin.id })) });
  return unread.length;
}

/** Preferences for every kind (missing rows = in-app only). */
export async function loadPreferences(db: PrismaClient, adminId: string): Promise<PreferenceRow[]> {
  const rows = await db.notificationPreference.findMany({ where: { adminUserId: adminId }, select: { kind: true, email: true, slack: true } });
  return NOTIFICATION_KINDS.map((kind) => {
    const r = rows.find((x) => x.kind === kind);
    return { kind, email: r?.email ?? false, slack: r?.slack ?? false };
  });
}

export async function savePreferences(db: PrismaClient, adminId: string, prefs: Array<{ kind: NotificationKind; email: boolean; slack: boolean }>): Promise<PreferenceRow[]> {
  await db.$transaction(
    prefs.map((p) =>
      db.notificationPreference.upsert({
        where: { adminUserId_kind: { adminUserId: adminId, kind: p.kind } },
        update: { email: p.email, slack: p.slack },
        create: { adminUserId: adminId, kind: p.kind, email: p.email, slack: p.slack },
      }),
    ),
  );
  return loadPreferences(db, adminId);
}

export { prisma as defaultDb };
