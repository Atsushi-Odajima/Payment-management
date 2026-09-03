import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { toUnmatchedDepositRow } from "@/lib/deposits/list";
import { matchUnmatchedDeposit } from "@/lib/deposits/service";
import { matchDepositSchema } from "@/lib/deposits/types";

/**
 * POST /api/unmatched-deposits/:id/match { transferId } — support attaches the
 * transfer id the customer forgot: the transaction is reconciled and, when it
 * completes, the merchant's API is notified (API re-notify). Master only, like
 * every deposit reconciliation.
 */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const admin = await requireMaster(req);
  const parsed = matchDepositSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { transferId: "format" } });
  const result = await matchUnmatchedDeposit(prisma, { id: params.id, transferId: parsed.data.transferId, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok({ deposit: toUnmatchedDepositRow(result.deposit), payment: result.payment, renotified: result.renotified });
});
