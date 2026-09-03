import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { currentScheduleIndex, feeScheduleInputSchema, ratesForPlan, toFeeScheduleViews } from "@/lib/merchants/fees";
import { parseDateInTz, startOfDayInTz } from "@/lib/time";

type Ctx = { params: { id: string } };

const SELECT = { id: true, plan: true, rates: true, effectiveFrom: true, note: true, createdAt: true } as const;

/** GET /api/merchants/:id/fees — every fee schedule, newest effective date first, with the current one flagged. */
export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const rows = await prisma.merchantFeeSchedule.findMany({ where: { merchantId: params.id }, orderBy: { effectiveFrom: "desc" }, select: SELECT });
  return ok({ schedules: toFeeScheduleViews(rows, new Date()) });
});

/**
 * POST /api/merchants/:id/fees — add a schedule (plan + rates) that takes
 * effect on `effectiveFrom` (today when omitted). Earlier schedules are kept
 * as history; the change itself is audited.
 */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const parsed = feeScheduleInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const merchant = await prisma.merchant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  const input = parsed.data;
  if (input.plan === "custom" && !input.rates) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { rates: "required" } });
  }
  const now = new Date();
  const effectiveFrom = input.effectiveFrom ? parseDateInTz(input.effectiveFrom)! : startOfDayInTz(now);
  const rates = ratesForPlan(input.plan, input.rates);

  const audit = await auditContextFromRequest(req);
  const existing = await prisma.merchantFeeSchedule.findMany({ where: { merchantId: params.id }, orderBy: { effectiveFrom: "desc" }, select: SELECT });
  const currentIdx = currentScheduleIndex(existing, now);
  const before = currentIdx >= 0 ? { plan: existing[currentIdx].plan, rates: JSON.parse(existing[currentIdx].rates), effectiveFrom: existing[currentIdx].effectiveFrom } : null;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.merchantFeeSchedule.create({
      data: { merchantId: params.id, plan: input.plan, rates: JSON.stringify(rates), effectiveFrom, note: input.note || null },
      select: SELECT,
    });
    await recordAudit(tx, audit, {
      action: "merchant.fee_update",
      targetType: "merchant",
      targetId: params.id,
      before,
      after: { plan: row.plan, rates, effectiveFrom: row.effectiveFrom, note: row.note },
    });
    return row;
  });
  const rows = await prisma.merchantFeeSchedule.findMany({ where: { merchantId: params.id }, orderBy: { effectiveFrom: "desc" }, select: SELECT });
  return ok({ created: created.id, schedules: toFeeScheduleViews(rows, now) }, { status: 201 });
});
