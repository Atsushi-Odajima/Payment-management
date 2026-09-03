import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

const Body = z.object({
  targetType: z.enum(["payment", "customer", "subscription", "unmatched_deposit", "email_log"]),
  id: z.string().min(1).max(64),
});

/**
 * POST /api/pii/unmask — reveal the personal data of one record (Phase M-2).
 * Permission pii.unmask (admin / cs); every call is audited with the target,
 * so reveals are traceable. Returns only the personal fields.
 */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "pii", "unmask");
  const { targetType, id } = Body.parse(await readJson(req));
  let fields: Record<string, string | null> = {};
  switch (targetType) {
    case "payment": {
      const p = await prisma.payment.findUnique({ where: { id }, select: { customerName: true, customerEmail: true, clientIp: true } });
      if (!p) throw new ApiError(404, "not_found", "errors.notFound");
      fields = p;
      break;
    }
    case "customer": {
      const c = await prisma.customer.findUnique({ where: { id }, select: { name: true, email: true, phone: true } });
      if (!c) throw new ApiError(404, "not_found", "errors.notFound");
      fields = c;
      break;
    }
    case "subscription": {
      const s = await prisma.subscription.findUnique({ where: { id }, select: { customerName: true, customerEmail: true } });
      if (!s) throw new ApiError(404, "not_found", "errors.notFound");
      fields = s;
      break;
    }
    case "unmatched_deposit": {
      const d = await prisma.unmatchedDeposit.findUnique({ where: { id }, select: { payerName: true } });
      if (!d) throw new ApiError(404, "not_found", "errors.notFound");
      fields = d;
      break;
    }
    case "email_log": {
      const e = await prisma.emailLog.findUnique({ where: { id }, select: { to: true } });
      if (!e) throw new ApiError(404, "not_found", "errors.notFound");
      fields = e;
      break;
    }
  }
  // The audit row must not carry the revealed values (redactForAudit would mask them anyway); record what was revealed.
  await recordAudit(prisma, await auditContextFromRequest(req), { action: "pii.unmask", targetType: targetType === "email_log" ? "email_template" : targetType === "unmatched_deposit" ? "unmatched_deposit" : targetType, targetId: id, after: { fields: Object.keys(fields), by: admin.loginId } });
  return ok({ targetType, id, fields });
});
