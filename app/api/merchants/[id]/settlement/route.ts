import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { settlementSettingsSchema } from "@/lib/settlements/types";

const SELECT = {
  settlementCycle: true,
  payoutTerm: true,
  bankName: true,
  bankBranch: true,
  bankAccountType: true,
  bankAccountNumber: true,
  bankAccountHolder: true,
  settlementFee: true,
} as const;

/** PATCH /api/merchants/:id/settlement — cycle, payout term, bank account, transfer fee. */
export const PATCH = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission(req, "merchant_contract", "update");
  const parsed = settlementSettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const before = await prisma.merchant.findUnique({ where: { id: params.id }, select: SELECT });
  if (!before) throw new ApiError(404, "not_found", "errors.notFound");
  const d = parsed.data;
  const data = {
    settlementCycle: d.settlementCycle,
    payoutTerm: d.payoutTerm,
    bankName: d.bankName || null,
    bankBranch: d.bankBranch || null,
    bankAccountType: d.bankAccountType,
    bankAccountNumber: d.bankAccountNumber || null,
    bankAccountHolder: d.bankAccountHolder || null,
    settlementFee: d.settlementFee,
  };
  const audit = await auditContextFromRequest(req);
  const after = await prisma.$transaction(async (tx) => {
    const row = await tx.merchant.update({ where: { id: params.id }, data, select: SELECT });
    await recordAudit(tx, audit, { action: "merchant.settlement_update", targetType: "merchant", targetId: params.id, before, after: row });
    return row;
  });
  return ok(after);
});
