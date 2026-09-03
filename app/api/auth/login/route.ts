import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeRole } from "@/lib/role";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { TWO_FACTOR_COOKIE, TWO_FACTOR_TTL_SEC, createTwoFactorToken, sessionCookieAttributes } from "@/lib/auth";
import { verifyPassword } from "@/lib/admin/password";
import { issueSession } from "@/lib/admin/session";
import { requestIp } from "@/lib/audit";

const Body = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/login — step 1 of the login.
 * Accounts with two-factor enabled get a short-lived 2FA cookie and
 * `requiresTwoFactor: true`; the session is issued by /api/auth/2fa.
 */
export const POST = withApiHandler(async (req) => {
  const { loginId, password } = Body.parse(await readJson(req));
  const user = await prisma.adminUser.findUnique({
    where: { loginId: loginId.toLowerCase() },
    select: { id: true, role: true, status: true, passwordHash: true, totpEnabled: true },
  });
  // Same error for unknown id, wrong password and disabled account.
  if (!user || user.status === "disabled" || !verifyPassword(password, user.passwordHash)) {
    throw new ApiError(401, "invalid_credentials", "errors.invalidCredentials");
  }
  if (user.totpEnabled) {
    const token = await createTwoFactorToken({ id: user.id, role: normalizeRole(user.role) });
    const res = ok({ authenticated: false, requiresTwoFactor: true });
    res.headers.append("set-cookie", `${TWO_FACTOR_COOKIE}=${token}; ${sessionCookieAttributes(TWO_FACTOR_TTL_SEC)}`);
    return res;
  }
  return issueSession(user, requestIp(req));
});
