import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { toUnmatchedDepositRow } from "@/lib/deposits/list";
import { lateMatchUnmatchedDeposit } from "@/lib/deposits/service";
import { lateMatchDepositSchema } from "@/lib/deposits/types";

/**
 * POST /api/unmatched-deposits/:id/late-match { reason } — apply a deposit
 * that arrived after the linked transaction expired (Phase P1-3). Runs the
 * `late_deposit` transition (expired → captured) and notifies the merchant
 * like any completion. Permission unmatched_deposit.match; reason required.
 */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const admin = await requirePermission(req, "unmatched_deposit", "match");
  const parsed = lateMatchDepositSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
  const result = await lateMatchUnmatchedDeposit(prisma, { id: params.id, reason: parsed.data.reason, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok({ deposit: toUnmatchedDepositRow(result.deposit), payment: result.payment, renotified: result.renotified });
});
