import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, readJson, withApiHandler } from "@/lib/api/handler";
import { TWO_FACTOR_COOKIE, cookieFromHeader, verifyTwoFactorToken } from "@/lib/auth";
import { decryptTotpSecret } from "@/lib/admin/secrets";
import { verifyTotp } from "@/lib/admin/totp";
import { issueSession } from "@/lib/admin/session";
import { requestIp } from "@/lib/audit";

const Body = z.object({ code: z.string().trim().min(6).max(8) });

/** POST /api/auth/2fa — step 2: the 6-digit authenticator code. */
export const POST = withApiHandler(async (req) => {
  const pending = await verifyTwoFactorToken(cookieFromHeader(req.headers.get("cookie"), TWO_FACTOR_COOKIE));
  if (!pending) throw new ApiError(401, "two_factor_expired", "errors.twoFactorExpired");
  const { code } = Body.parse(await readJson(req));
  const user = await prisma.adminUser.findUnique({
    where: { id: pending.sub },
    select: { id: true, role: true, status: true, totpEnabled: true, totpSecretEnc: true },
  });
  if (!user || user.status === "disabled" || !user.totpEnabled || !user.totpSecretEnc) {
    throw new ApiError(401, "two_factor_expired", "errors.twoFactorExpired");
  }
  if (!verifyTotp(decryptTotpSecret(user.totpSecretEnc), code)) {
    throw new ApiError(401, "invalid_code", "errors.totpInvalid");
  }
  return issueSession(user, requestIp(req));
});
