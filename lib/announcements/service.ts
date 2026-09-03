// Announcement mutations (Phase G-3): create / edit drafts, publish, end,
// and append incident updates. Everything is audited.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import type { AnnouncementInput, IncidentPhase } from "./types";

export const ANNOUNCEMENT_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  publishFrom: true,
  publishUntil: true,
  targetAll: true,
  targetMerchantIds: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  updates: { orderBy: { createdAt: "asc" as const }, select: { id: true, phase: true, body: true, createdAt: true } },
} as const;

function dataFrom(input: AnnouncementInput) {
  return {
    kind: input.kind,
    title: input.title,
    body: input.body,
    publishFrom: input.publishFrom ? new Date(input.publishFrom) : new Date(),
    publishUntil: input.publishUntil ? new Date(input.publishUntil) : null,
    targetAll: input.targetAll,
    targetMerchantIds: JSON.stringify(input.targetAll ? [] : input.targetMerchantIds),
  };
}

export async function createAnnouncement(db: PrismaClient, opts: { input: AnnouncementInput; publish: boolean; actorId: string; audit: AuditContext }) {
  const data = dataFrom(opts.input);
  return db.$transaction(async (tx) => {
    const row = await tx.announcement.create({ data: { ...data, status: opts.publish ? "published" : "draft", createdById: opts.actorId }, select: ANNOUNCEMENT_SELECT });
    if (opts.input.kind === "incident") {
      await tx.announcementUpdate.create({ data: { announcementId: row.id, phase: "occurred", body: opts.input.body } });
    }
    await recordAudit(tx, opts.audit, { action: "announcement.create", targetType: "announcement", targetId: row.id, after: { ...data, status: row.status } });
    return tx.announcement.findUniqueOrThrow({ where: { id: row.id }, select: ANNOUNCEMENT_SELECT });
  });
}

export async function updateAnnouncement(db: PrismaClient, opts: { id: string; input: AnnouncementInput; audit: AuditContext }) {
  const before = await db.announcement.findUnique({ where: { id: opts.id }, select: ANNOUNCEMENT_SELECT });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  const data = dataFrom(opts.input);
  return db.$transaction(async (tx) => {
    const row = await tx.announcement.update({ where: { id: opts.id }, data, select: ANNOUNCEMENT_SELECT });
    await recordAudit(tx, opts.audit, {
      action: "announcement.update",
      targetType: "announcement",
      targetId: opts.id,
      before: { kind: before.kind, title: before.title, publishFrom: before.publishFrom, publishUntil: before.publishUntil, targetAll: before.targetAll },
      after: { kind: row.kind, title: row.title, publishFrom: row.publishFrom, publishUntil: row.publishUntil, targetAll: row.targetAll },
    });
    return row;
  });
}

/** publish: draft | ended → published; end: published → ended. */
export async function setAnnouncementStatus(db: PrismaClient, opts: { id: string; action: "publish" | "end"; audit: AuditContext }) {
  const before = await db.announcement.findUnique({ where: { id: opts.id }, select: { status: true } });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  const from = opts.action === "publish" ? ["draft", "ended"] : ["published"];
  if (!from.includes(before.status)) throw new ApiError(409, "invalid_transition", "errors.announcementTransition");
  const to = opts.action === "publish" ? "published" : "ended";
  return db.$transaction(async (tx) => {
    const updated = await tx.announcement.updateMany({ where: { id: opts.id, status: { in: from } }, data: { status: to } });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.announcementTransition");
    await recordAudit(tx, opts.audit, { action: `announcement.${opts.action}`, targetType: "announcement", targetId: opts.id, before: { status: before.status }, after: { status: to } });
    return tx.announcement.findUniqueOrThrow({ where: { id: opts.id }, select: ANNOUNCEMENT_SELECT });
  });
}

/** Append a timeline entry; "resolved" also ends the announcement's active banner by setting publishUntil = now. */
export async function addAnnouncementUpdate(db: PrismaClient, opts: { id: string; phase: IncidentPhase; body: string; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const a = await db.announcement.findUnique({ where: { id: opts.id }, select: { id: true, kind: true } });
  if (!a) throw new ApiError(404, "not_found", "errors.notFound");
  return db.$transaction(async (tx) => {
    const u = await tx.announcementUpdate.create({ data: { announcementId: a.id, phase: opts.phase, body: opts.body, createdAt: now }, select: { id: true } });
    await recordAudit(tx, opts.audit, { action: "announcement.add_update", targetType: "announcement", targetId: a.id, after: { updateId: u.id, phase: opts.phase, body: opts.body } });
    return tx.announcement.findUniqueOrThrow({ where: { id: a.id }, select: ANNOUNCEMENT_SELECT });
  });
}
