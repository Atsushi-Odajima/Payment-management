import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { toUnmatchedDepositRow } from "@/lib/deposits/list";
import { dismissUnmatchedDeposit } from "@/lib/deposits/service";
import { dismissDepositSchema } from "@/lib/deposits/types";

/** POST /api/unmatched-deposits/:id/dismiss { reason } — the deposit is handled outside the system (returned to the payer, duplicate, …). */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission(req, "unmatched_deposit", "dismiss");
  const parsed = dismissDepositSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
  const row = await dismissUnmatchedDeposit(prisma, { id: params.id, reason: parsed.data.reason, audit: await auditContextFromRequest(req) });
  return ok(toUnmatchedDepositRow(row));
});
