import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api/role-guard";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateIpRestrictionInput } from "@/lib/ip-restrictions/schema";
import { assertAllowlistKeepsSelf, assertNotSelfBlock } from "@/lib/ip-restrictions/self-block";
import { normalizeCidr } from "@/lib/ip";
import { IP_RESTRICTION_SELECT } from "../select";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const rule = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: IP_RESTRICTION_SELECT });
  if (!rule) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(rule);
});

export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
    await requirePermission(req, "ip_restriction", "update");
  const v = validateIpRestrictionInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  if (v.data.merchantId) {
    const m = await prisma.merchant.findUnique({ where: { id: v.data.merchantId }, select: { id: true } });
    if (!m) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { merchantId: "invalid" } });
  }
  assertNotSelfBlock(req, v.data);
  const existing = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: IP_RESTRICTION_SELECT });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  if (existing.target === "admin") await assertAllowlistKeepsSelf(prisma, req, { excludeId: params.id, replacement: v.data });
  const audit = await auditContextFromRequest(req);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.ipRestriction.update({
      where: { id: params.id },
      data: { ...v.data, cidr: normalizeCidr(v.data.cidr) ?? v.data.cidr },
      select: IP_RESTRICTION_SELECT,
    });
    await recordAudit(tx, audit, { action: "ip_restriction.update", targetType: "ip_restriction", targetId: row.id, before: existing, after: row });
    return row;
  });
  return ok(updated);
});

export const DELETE = withApiHandler<Ctx>(async (req, { params }) => {
    await requirePermission(req, "ip_restriction", "delete");
  const existing = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: IP_RESTRICTION_SELECT });
  if (!existing) throw new ApiError(404, "not_found", "errors.notFound");
  if (existing.target === "admin") await assertAllowlistKeepsSelf(prisma, req, { excludeId: params.id, replacement: null });
  const audit = await auditContextFromRequest(req);
  await prisma.$transaction(async (tx) => {
    await tx.ipRestriction.delete({ where: { id: params.id } });
    await recordAudit(tx, audit, { action: "ip_restriction.delete", targetType: "ip_restriction", targetId: params.id, before: existing });
  });
  return ok({ deleted: true });
});
