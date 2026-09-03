import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { encryptTotpSecret } from "@/lib/admin/secrets";
import { generateTotpSecret, totpQrSvg, totpUri } from "@/lib/admin/totp";

/**
 * POST /api/account/totp/setup — start enrolment: a new secret is stored
 * (encrypted, not yet enabled) and returned with the QR code. Enabling
 * requires a valid code (…/enable), which proves the app was registered.
 */
export const POST = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const secret = generateTotpSecret();
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecretEnc: encryptTotpSecret(secret), totpEnabled: false } });
  const uri = totpUri(secret, admin.loginId);
  return ok({ secret, uri, qrSvg: totpQrSvg(uri) });
});
