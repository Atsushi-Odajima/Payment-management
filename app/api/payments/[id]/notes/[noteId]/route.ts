import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { deleteNote, noteUpdateSchema, updateNote } from "@/lib/payments/notes";

type Ctx = { params: { id: string; noteId: string } };

/** PATCH /api/payments/:id/notes/:noteId { body?, pinned? } — body: author only; pinned: payment_note.pin. */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const actor = await requirePermission(req, "payment_note", "update_own");
  const parsed = noteUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  return ok(await updateNote(prisma, { paymentId: params.id, noteId: params.noteId, actor, body: parsed.data.body, pinned: parsed.data.pinned }));
});

/** DELETE /api/payments/:id/notes/:noteId — admin only, audited (payment.note_delete). */
export const DELETE = withApiHandler<Ctx>(async (req, { params }) => {
  await requirePermission(req, "payment_note", "delete");
  await deleteNote(prisma, { paymentId: params.id, noteId: params.noteId, audit: await auditContextFromRequest(req) });
  return ok({ deleted: true });
});
