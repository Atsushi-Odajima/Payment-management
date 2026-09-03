import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { decryptTotpSecret } from "@/lib/admin/secrets";
import { verifyTotp } from "@/lib/admin/totp";
import { recordAudit, requestIp } from "@/lib/audit";

const Body = z.object({ code: z.string().trim().min(6).max(8) });

/** POST /api/account/totp/enable — confirm enrolment with a code from the app. */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const { code } = Body.parse(await readJson(req));
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpSecretEnc: true } });
  if (!row.totpSecretEnc) throw new ApiError(400, "totp_not_setup", "errors.totpNotSetup");
  if (!verifyTotp(decryptTotpSecret(row.totpSecretEnc), code)) throw new ApiError(400, "invalid_code", "errors.totpInvalid");
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: admin.id }, data: { totpEnabled: true } });
    await recordAudit(tx, { actor: { type: "admin", id: admin.id }, ip: requestIp(req) }, { action: "account.totp_enable", targetType: "admin_user", targetId: admin.id, before: { totpEnabled: false }, after: { totpEnabled: true } });
  });
  return ok({ totpEnabled: true });
});
