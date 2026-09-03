import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { validateAdminInput } from "@/lib/admin/schema";
import { ADMIN_SELECT, toAdminView } from "@/lib/admin/select";
import { assertNotLastMaster, assertNotSelfDemotion } from "@/lib/admin/guards";
import { recordAudit, requestIp } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/ids";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (req, { params }) => {
  await requireMaster(req);
  const row = await prisma.adminUser.findUnique({ where: { id: params.id }, select: ADMIN_SELECT });
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(toAdminView(row));
});

/** PATCH /api/admins/:id — name / email / role / status (loginId is immutable). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const actor = await requireMaster(req);
  const v = validateAdminInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  const existing = await prisma.adminUser.findUnique({ where: { id: params.id }, select: ADMIN_SELECT });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  // "invited" is only ever set by the system (until the first login).
  const status = v.data.status === "invited" ? existing.status : v.data.status;
  const next = { ...v.data, email: v.data.email.toLowerCase(), status };
  assertNotSelfDemotion(actor.id, existing, next);
  await assertNotLastMaster(prisma, existing, next);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({ where: { id: params.id }, data: next, select: ADMIN_SELECT });
      await recordAudit(tx, { actor: { type: "admin", id: actor.id }, ip: requestIp(req) }, { action: "admin.update", targetType: "admin_user", targetId: row.id, before: existing, after: row });
      return row;
    });
    return ok(toAdminView(updated));
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "conflict", "errors.conflict", undefined, { fieldErrors: { email: "taken" } });
    throw err;
  }
});
