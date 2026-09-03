// Blacklist loaders and mutations (Phase F-2).

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { isUniqueViolation } from "@/lib/ids";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { isBlacklistKind, isBlacklistSource, isBlacklistStatus, normalizeBlacklistValue, type BlacklistKind, type BlacklistSource, type BlacklistStatus } from "./types";

export interface BlacklistFilters {
  kind: BlacklistKind | "";
  source: BlacklistSource | "";
  status: BlacklistStatus | "";
}

export interface BlacklistRow {
  id: string;
  kind: BlacklistKind;
  value: string;
  reason: string | null;
  source: BlacklistSource;
  status: BlacklistStatus;
  createdBy: { id: string; loginId: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export const BLACKLIST_SORT_KEYS = ["createdAt", "kind", "status", "source"] as const;

export function parseBlacklistFilters(q: QueryParams | undefined): BlacklistFilters {
  return {
    kind: isBlacklistKind(q?.kind) ? q!.kind! : "",
    source: isBlacklistSource(q?.source) ? q!.source! : "",
    status: isBlacklistStatus(q?.status) ? q!.status! : "",
  };
}

export function parseBlacklistSort(q: QueryParams | undefined): SortState {
  return parseSort(q, BLACKLIST_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

const SELECT = { id: true, kind: true, value: true, reason: true, source: true, status: true, createdById: true, createdAt: true, updatedAt: true } as const;

async function toRows(raw: Array<{ id: string; kind: string; value: string; reason: string | null; source: string; status: string; createdById: string | null; createdAt: Date; updatedAt: Date }>): Promise<BlacklistRow[]> {
  const ids = [...new Set(raw.map((r) => r.createdById).filter((x): x is string => !!x))];
  const admins = ids.length ? await prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, loginId: true, name: true } }) : [];
  const byId = new Map(admins.map((a) => [a.id, a]));
  return raw.map((r) => ({
    id: r.id,
    kind: isBlacklistKind(r.kind) ? r.kind : "ip",
    value: r.value,
    reason: r.reason,
    source: isBlacklistSource(r.source) ? r.source : "manual",
    status: isBlacklistStatus(r.status) ? r.status : "active",
    createdBy: r.createdById ? byId.get(r.createdById) ?? null : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

const STATUS_RANK: Record<BlacklistStatus, number> = { candidate: 0, active: 1, disabled: 2, rejected: 3 };

export async function loadBlacklist(opts: { filters: BlacklistFilters; sort: SortState; page: number; pageSize: number }) {
  const f = opts.filters;
  const where = { ...(f.kind ? { kind: f.kind } : {}), ...(f.source ? { source: f.source } : {}), ...(f.status ? { status: f.status } : {}) };
  const defaultOrder = opts.sort.key === "createdAt" && opts.sort.dir === "desc";
  const [raw, total, candidateCount] = await Promise.all([
    defaultOrder
      ? prisma.blacklist.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, select: SELECT })
      : prisma.blacklist.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: SELECT }),
    prisma.blacklist.count({ where }),
    prisma.blacklist.count({ where: { status: "candidate" } }),
  ]);
  let rows = await toRows(raw);
  if (defaultOrder) {
    rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
    rows = rows.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
  }
  return { rows, total, candidateCount };
}

export async function createBlacklistEntry(db: PrismaClient, opts: { kind: BlacklistKind; value: string; reason: string; actorId: string; audit: AuditContext }): Promise<BlacklistRow> {
  const value = normalizeBlacklistValue(opts.kind, opts.value);
  try {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.blacklist.create({ data: { kind: opts.kind, value, reason: opts.reason || null, source: "manual", status: "active", createdById: opts.actorId }, select: SELECT });
      await recordAudit(tx, opts.audit, { action: "blacklist.create", targetType: "blacklist", targetId: created.id, after: { kind: opts.kind, value, source: "manual", status: "active", reason: opts.reason || null } });
      return created;
    });
    return (await toRows([row]))[0];
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError(409, "blacklist_exists", "errors.blacklistExists");
    throw e;
  }
}

/** Approve / reject a candidate, enable / disable an entry. */
export async function updateBlacklistEntry(db: PrismaClient, opts: { id: string; status: BlacklistStatus; reason?: string; audit: AuditContext }): Promise<BlacklistRow> {
  const before = await db.blacklist.findUnique({ where: { id: opts.id }, select: SELECT });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  if (opts.status === "candidate") throw new ApiError(400, "invalid_input", "errors.invalidInput");
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.blacklist.update({ where: { id: opts.id }, data: { status: opts.status, ...(opts.reason !== undefined ? { reason: opts.reason || null } : {}) }, select: SELECT });
    await recordAudit(tx, opts.audit, { action: "blacklist.update", targetType: "blacklist", targetId: opts.id, before: { status: before.status, reason: before.reason }, after: { status: updated.status, reason: updated.reason } });
    return updated;
  });
  return (await toRows([row]))[0];
}
