import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import { passwordSchema } from "@/lib/admin/schema";
import { recordAudit, requestIp } from "@/lib/audit";

const Body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

/** POST /api/account/password — change your own password. */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) {
    const short = parsed.error.issues.some((i) => i.path[0] === "newPassword");
    throw new ApiError(400, "invalid_input", short ? "errors.passwordTooShort" : "errors.invalidInput", undefined, {
      fieldErrors: { newPassword: "passwordShort" },
    });
  }
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } });
  if (!verifyPassword(parsed.data.currentPassword, row.passwordHash)) {
    throw new ApiError(400, "wrong_password", "errors.currentPasswordWrong", undefined, { fieldErrors: { currentPassword: "invalid" } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({ where: { id: admin.id }, data: { passwordHash: hashPassword(parsed.data.newPassword) } });
    await recordAudit(tx, { actor: { type: "admin", id: admin.id }, ip: requestIp(req) }, { action: "account.password_change", targetType: "admin_user", targetId: admin.id });
  });
  return ok({ changed: true });
});
