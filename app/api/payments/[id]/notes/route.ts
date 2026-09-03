import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { createNote, listNotes, noteInputSchema } from "@/lib/payments/notes";

type Ctx = { params: { id: string } };

/** GET /api/payments/:id/notes — internal notes of a transaction (dashboard only). */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => ok(await listNotes(prisma, params.id)));

/** POST /api/payments/:id/notes { body, pinned? } — staff roles; pinning needs payment_note.pin. */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  const actor = await requirePermission(req, "payment_note", "create");
  const parsed = noteInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  return ok(await createNote(prisma, { paymentId: params.id, actor, body: parsed.data.body, pinned: parsed.data.pinned }), { status: 201 });
});
