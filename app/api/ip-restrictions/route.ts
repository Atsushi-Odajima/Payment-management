import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateIpRestrictionInput } from "@/lib/ip-restrictions/schema";
import { assertNotSelfBlock } from "@/lib/ip-restrictions/self-block";
import { normalizeCidr } from "@/lib/ip";
import { DEMO_LIMITS } from "@/lib/demo";
import { IP_RESTRICTION_SELECT } from "./select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

export const GET = withApiHandler(async () => {
  const rules = await prisma.ipRestriction.findMany({
    orderBy: [{ target: "asc" }, { createdAt: "asc" }],
    select: IP_RESTRICTION_SELECT,
  });
  return ok({ rules });
});

/** POST /api/ip-restrictions — add a rule (IPv4 or CIDR; deny blocks, allow is informational). */
export const POST = withApiHandler(async (req) => {
  const v = validateIpRestrictionInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  if (v.data.merchantId) {
    const m = await prisma.merchant.findUnique({ where: { id: v.data.merchantId }, select: { id: true } });
    if (!m) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { merchantId: "invalid" } });
  }
  assertNotSelfBlock(req, v.data);
  const count = await prisma.ipRestriction.count();
  if (count >= DEMO_LIMITS.ipRestrictions) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.ipRestrictions });
  }
  const audit = await auditContextFromRequest(req);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.ipRestriction.create({
      data: { ...v.data, cidr: normalizeCidr(v.data.cidr) ?? v.data.cidr },
      select: IP_RESTRICTION_SELECT,
    });
    await recordAudit(tx, audit, { action: "ip_restriction.create", targetType: "ip_restriction", targetId: row.id, after: row });
    return row;
  });
  return ok(created, { status: 201 });
});
