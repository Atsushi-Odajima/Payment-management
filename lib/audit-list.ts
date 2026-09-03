// Server-side loader for the audit log screen and its CSV export.

import { prisma } from "@/lib/db";
import { isAuditAction, isAuditTargetType, type AuditAction, type AuditActorType, type AuditTargetType } from "@/lib/audit";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";

export interface AuditFilters {
  actor: string;
  action: AuditAction | "";
  targetType: AuditTargetType | "";
  from: string;
  to: string;
}

export interface AuditRow {
  id: string;
  actorType: AuditActorType | string;
  actor: { id: string; loginId: string; name: string } | null;
  /** The merchant when actorType is "merchant" (public API / portal, Phase L). */
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface AuditDetail extends AuditRow {
  before: unknown;
  after: unknown;
}

export const AUDIT_SORT_KEYS = ["createdAt", "action", "targetType"] as const;

export function parseAuditFilters(q: QueryParams | undefined): AuditFilters {
  return {
    actor: (q?.actor ?? "").trim().slice(0, 64),
    action: isAuditAction(q?.action) ? q!.action! : "",
    targetType: isAuditTargetType(q?.targetType) ? q!.targetType! : "",
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
  };
}

export function parseAuditSort(q: QueryParams | undefined): SortState {
  return parseSort(q, AUDIT_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

function whereFor(f: AuditFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    ...(f.actor ? { actorId: f.actor } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.targetType ? { targetType: f.targetType } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
  };
}

const ROW_SELECT = {
  id: true,
  actorType: true,
  actor: { select: { id: true, loginId: true, name: true } },
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  action: true,
  targetType: true,
  targetId: true,
  ip: true,
  createdAt: true,
} as const;

export async function loadAuditLogs(opts: { filters: AuditFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { [opts.sort.key]: opts.sort.dir },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: ROW_SELECT,
    }),
    prisma.auditLog.count({ where }),
    prisma.adminUser.findMany({ orderBy: { loginId: "asc" }, select: { id: true, loginId: true, name: true } }),
  ]);
  return { rows: rows as AuditRow[], total, actors };
}

export async function loadAuditLogsForExport(filters: AuditFilters, sort: SortState, max: number): Promise<AuditDetail[]> {
  const rows = await prisma.auditLog.findMany({
    where: whereFor(filters),
    orderBy: { [sort.key]: sort.dir },
    take: max,
    select: { ...ROW_SELECT, before: true, after: true },
  });
  return rows.map((r) => ({ ...r, before: parse(r.before), after: parse(r.after) }));
}

export async function loadAuditLog(id: string): Promise<AuditDetail | null> {
  const r = await prisma.auditLog.findUnique({ where: { id }, select: { ...ROW_SELECT, before: true, after: true } });
  return r ? { ...r, before: parse(r.before), after: parse(r.after) } : null;
}

function parse(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
