import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { recordAudit, requestIp } from "@/lib/audit";

type Ctx = { params: { id: string } };

/** POST /api/admins/:id/totp-reset — turn a user's two-factor off (lost device). */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  const actor = await requireMaster(req);
  const target = await prisma.adminUser.findUnique({ where: { id: params.id }, select: { id: true, totpEnabled: true } });
  if (!target) throw new ApiError(404, "not_found", "errors.notFound");
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: params.id }, data: { totpEnabled: false, totpSecretEnc: null } });
    await recordAudit(tx, { actor: { type: "admin", id: actor.id }, ip: requestIp(req) }, { action: "admin.totp_reset", targetType: "admin_user", targetId: params.id, before: { totpEnabled: target.totpEnabled }, after: { totpEnabled: false } });
  });
  return ok({ totpEnabled: false });
});
