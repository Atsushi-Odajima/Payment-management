import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateIpRestrictionInput } from "@/lib/ip-restrictions/schema";
import { normalizeCidr } from "@/lib/ip";
import { IP_RESTRICTION_SELECT } from "../select";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const rule = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: IP_RESTRICTION_SELECT });
  if (!rule) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(rule);
});

export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const v = validateIpRestrictionInput(await readJson(req));
  if (!v.ok) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  if (v.data.merchantId) {
    const m = await prisma.merchant.findUnique({ where: { id: v.data.merchantId }, select: { id: true } });
    if (!m) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { merchantId: "invalid" } });
  }
  const exists = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  const updated = await prisma.ipRestriction.update({
    where: { id: params.id },
    data: { ...v.data, cidr: normalizeCidr(v.data.cidr) ?? v.data.cidr },
    select: IP_RESTRICTION_SELECT,
  });
  return ok(updated);
});

export const DELETE = withApiHandler<Ctx>(async (_req, { params }) => {
  const exists = await prisma.ipRestriction.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  await prisma.ipRestriction.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});
