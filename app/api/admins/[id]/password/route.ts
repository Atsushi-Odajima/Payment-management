import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { generateInitialPassword, hashPassword } from "@/lib/admin/password";
import { recordAudit, requestIp } from "@/lib/audit";

type Ctx = { params: { id: string } };

/** POST /api/admins/:id/password — issue a temporary password (master); shown once. */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  const actor = await requireMaster(req);
  const target = await prisma.adminUser.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!target) throw new ApiError(404, "not_found", "errors.notFound");
  const password = generateInitialPassword();
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: params.id }, data: { passwordHash: hashPassword(password) } });
    await recordAudit(tx, { actor: { type: "admin", id: actor.id }, ip: requestIp(req) }, { action: "admin.password_reset", targetType: "admin_user", targetId: params.id });
  });
  return ok({ password });
});
