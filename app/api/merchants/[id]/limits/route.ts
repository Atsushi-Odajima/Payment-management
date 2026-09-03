import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { FEE_METHODS } from "@/lib/merchants/fees";
import { limitsInputSchema, limitsView, usageFor } from "@/lib/merchants/limits";
import { isDataMode } from "@/lib/mode";

type Ctx = { params: { id: string } };

/** GET /api/merchants/:id/limits?mode=test|live — limits plus today's / this month's usage per method. */
export const GET = withApiHandler<Ctx>(async (req, { params }) => {
  const modeParam = new URL(req.url).searchParams.get("mode");
  const livemode = isDataMode(modeParam) ? modeParam === "live" : false;
  const rows = await prisma.merchantLimit.findMany({ where: { merchantId: params.id } });
  const usage = await Promise.all(FEE_METHODS.map((method) => usageFor(prisma, { merchantId: params.id, method, livemode })));
  return ok({ limits: limitsView(rows), usage });
});

/** PUT /api/merchants/:id/limits — replace the whole limit set (one row per method). */
export const PUT = withApiHandler<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const parsed = limitsInputSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  const merchant = await prisma.merchant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");

  const audit = await auditContextFromRequest(req);
  const before = limitsView(await prisma.merchantLimit.findMany({ where: { merchantId: params.id } }));
  const next = parsed.data.filter((l) => l.perTransaction !== null || l.daily !== null || l.monthly !== null);
  await prisma.$transaction(async (tx) => {
    await tx.merchantLimit.deleteMany({ where: { merchantId: params.id } });
    if (next.length > 0) await tx.merchantLimit.createMany({ data: next.map((l) => ({ ...l, merchantId: params.id })) });
    await recordAudit(tx, audit, { action: "merchant.limit_update", targetType: "merchant", targetId: params.id, before: { limits: before }, after: { limits: next } });
  });
  return ok({ limits: next });
});
