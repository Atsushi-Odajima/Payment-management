import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { RISK_SETTINGS_ID } from "@/lib/risk/types";
import { demoChargeSettingsSchema } from "@/lib/subscriptions/types";

/** GET /api/subscriptions/demo-settings — demo charge failure percentage. */
export const GET = withApiHandler(async () => {
  const row = await prisma.riskSetting.findUnique({ where: { id: RISK_SETTINGS_ID }, select: { demoChargeFailPercent: true } });
  return ok({ demoChargeFailPercent: row?.demoChargeFailPercent ?? 20 });
});

/** PUT /api/subscriptions/demo-settings — master: failure percentage used by the charge cron. */
export const PUT = withApiHandler(async (req) => {
  await requireMaster(req);
  const parsed = demoChargeSettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { demoChargeFailPercent: "range" } });
  const before = await prisma.riskSetting.findUnique({ where: { id: RISK_SETTINGS_ID }, select: { demoChargeFailPercent: true } });
  const audit = await auditContextFromRequest(req);
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.riskSetting.upsert({ where: { id: RISK_SETTINGS_ID }, update: parsed.data, create: { id: RISK_SETTINGS_ID, ...parsed.data }, select: { demoChargeFailPercent: true } });
    await recordAudit(tx, audit, { action: "risk.settings_update", targetType: "risk_setting", targetId: RISK_SETTINGS_ID, before: before ?? { demoChargeFailPercent: 20 }, after: r });
    return r;
  });
  return ok(row);
});
