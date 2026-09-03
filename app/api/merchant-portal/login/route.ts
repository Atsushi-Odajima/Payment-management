import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requestIp } from "@/lib/audit";
import { loginMerchant } from "@/lib/merchant-portal/session";
import { MERCHANT_COOKIE, MERCHANT_SESSION_TTL_SEC, merchantCookieAttributes } from "@/lib/merchant-portal/token";

const Body = z.object({ merchantCode: z.string().trim().min(1).max(20), password: z.string().min(1).max(200) });

/**
 * POST /api/merchant-portal/login — merchant code + password → the merchant
 * cookie (Phase L-2). Five consecutive failures lock the account for 15
 * minutes (423). Rate limited like the operator login by the middleware.
 */
export const POST = withApiHandler(
  async (req) => {
    const { merchantCode, password } = Body.parse(await readJson(req));
    const { token, merchant } = await loginMerchant(prisma, { merchantCode, password, ip: requestIp(req) });
    const res = ok({ authenticated: true, merchant: { id: merchant.id, merchantCode: merchant.merchantCode, siteName: merchant.siteName } });
    res.headers.append("set-cookie", `${MERCHANT_COOKIE}=${token}; ${merchantCookieAttributes(MERCHANT_SESSION_TTL_SEC)}`);
    return res;
  },
  { ipRestricted: false },
);
