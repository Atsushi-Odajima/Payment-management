// Transaction notes (Phase I-2): internal comments on a transaction, shown in
// the operator dashboard only. Authors edit their own notes; deletion is an
// admin action and is the only note operation written to the audit log.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import type { CurrentAdmin } from "@/lib/admin/types";
import { can } from "@/lib/role";

export const noteInputSchema = z.object({
  body: z.string().trim().min(1, "required").max(2000, "tooLong"),
  pinned: z.boolean().optional(),
});
export const noteUpdateSchema = z.object({
  body: z.string().trim().min(1, "required").max(2000, "tooLong").optional(),
  pinned: z.boolean().optional(),
});

export interface NoteRow {
  id: string;
  paymentId: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; loginId: string };
}

export const NOTE_SELECT = { id: true, paymentId: true, body: true, pinned: true, createdAt: true, editedAt: true, author: { select: { id: true, name: true, loginId: true } } } as const;

export async function listNotes(db: PrismaClient, paymentId: string): Promise<NoteRow[]> {
  return db.transactionNote.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" }, select: NOTE_SELECT });
}

export async function createNote(db: PrismaClient, opts: { paymentId: string; actor: CurrentAdmin; body: string; pinned?: boolean }): Promise<NoteRow> {
  const payment = await db.payment.findUnique({ where: { id: opts.paymentId }, select: { id: true } });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (opts.pinned && !can(opts.actor.role, "payment_note", "pin")) throw new ApiError(403, "permission_required", "errors.permissionRequired");
  return db.transactionNote.create({ data: { paymentId: opts.paymentId, authorId: opts.actor.id, body: opts.body, pinned: opts.pinned ?? false }, select: NOTE_SELECT });
}

/** Body edits are for the author only; pinning follows payment_note.pin. */
export async function updateNote(db: PrismaClient, opts: { paymentId: string; noteId: string; actor: CurrentAdmin; body?: string; pinned?: boolean }): Promise<NoteRow> {
  const note = await db.transactionNote.findUnique({ where: { id: opts.noteId }, select: { id: true, paymentId: true, authorId: true } });
  if (!note || note.paymentId !== opts.paymentId) throw new ApiError(404, "not_found", "errors.notFound");
  if (opts.body !== undefined && note.authorId !== opts.actor.id) throw new ApiError(403, "not_author", "errors.noteNotAuthor");
  if (opts.pinned !== undefined && !can(opts.actor.role, "payment_note", "pin")) throw new ApiError(403, "permission_required", "errors.permissionRequired");
  return db.transactionNote.update({
    where: { id: note.id },
    data: { ...(opts.body !== undefined ? { body: opts.body, editedAt: new Date() } : {}), ...(opts.pinned !== undefined ? { pinned: opts.pinned } : {}) },
    select: NOTE_SELECT,
  });
}

/** Admin only (checked by the route); the deletion is audited with the note's content. */
export async function deleteNote(db: PrismaClient, opts: { paymentId: string; noteId: string; audit: AuditContext }): Promise<void> {
  const note = await db.transactionNote.findUnique({ where: { id: opts.noteId }, select: { id: true, paymentId: true, authorId: true, body: true, pinned: true } });
  if (!note || note.paymentId !== opts.paymentId) throw new ApiError(404, "not_found", "errors.notFound");
  await db.$transaction(async (tx) => {
    await tx.transactionNote.delete({ where: { id: note.id } });
    await recordAudit(tx, opts.audit, { action: "payment.note_delete", targetType: "payment", targetId: opts.paymentId, before: { noteId: note.id, authorId: note.authorId, body: note.body, pinned: note.pinned }, after: null });
  });
}
