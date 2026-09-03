import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { SESSION_COOKIE, TWO_FACTOR_COOKIE, sessionCookieAttributes } from "@/lib/auth";
import { currentAdminFromRequest } from "@/lib/admin/current";
import { recordAudit, requestIp } from "@/lib/audit";

export const POST = withApiHandler(async (req) => {
  const admin = await currentAdminFromRequest(req);
  if (admin) {
    await recordAudit(prisma, { actor: { type: "admin", id: admin.id }, ip: requestIp(req) }, { action: "auth.logout", targetType: "session", targetId: admin.id });
  }
  const res = ok({ authenticated: false });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; ${sessionCookieAttributes(0)}`);
  res.headers.append("set-cookie", `${TWO_FACTOR_COOKIE}=; ${sessionCookieAttributes(0)}`);
  return res;
});
