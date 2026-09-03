import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { verifyPassword } from "@/lib/admin/password";
import { recordAudit, requestIp } from "@/lib/audit";

const Body = z.object({ password: z.string().min(1).max(200) });

/** POST /api/account/totp/disable — turn two-factor off (password re-entry required). */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const { password } = Body.parse(await readJson(req));
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true, totpEnabled: true } });
  if (!verifyPassword(password, row.passwordHash)) {
    throw new ApiError(400, "wrong_password", "errors.currentPasswordWrong", undefined, { fieldErrors: { password: "invalid" } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: admin.id }, data: { totpEnabled: false, totpSecretEnc: null } });
    await recordAudit(tx, { actor: { type: "admin", id: admin.id }, ip: requestIp(req) }, { action: "account.totp_disable", targetType: "admin_user", targetId: admin.id, before: { totpEnabled: row.totpEnabled }, after: { totpEnabled: false } });
  });
  return ok({ totpEnabled: false });
});
