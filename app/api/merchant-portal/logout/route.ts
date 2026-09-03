import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { cookieFromHeader } from "@/lib/auth";
import { merchantAuditContext, recordAudit, requestIp } from "@/lib/audit";
import { currentMerchantFromToken } from "@/lib/merchant-portal/session";
import { MERCHANT_COOKIE, merchantCookieAttributes } from "@/lib/merchant-portal/token";

/** POST /api/merchant-portal/logout — clears the merchant cookie (audited when a session existed). */
export const POST = withApiHandler(
  async (req) => {
    const merchant = await currentMerchantFromToken(prisma, cookieFromHeader(req.headers.get("cookie"), MERCHANT_COOKIE));
    if (merchant) await recordAudit(prisma, merchantAuditContext(merchant.id, requestIp(req)), { action: "merchant.logout", targetType: "merchant", targetId: merchant.id });
    const res = ok({ authenticated: false });
    res.headers.append("set-cookie", `${MERCHANT_COOKIE}=; ${merchantCookieAttributes(0)}`);
    return res;
  },
  { ipRestricted: false },
);
