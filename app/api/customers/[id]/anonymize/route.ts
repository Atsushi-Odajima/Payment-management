import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { anonymizeCustomer } from "@/lib/customers/service";

const Body = z.object({ reason: z.string().trim().min(1, "required").max(500, "tooLong") });

/** POST /api/customers/:id/anonymize — admin, reason required, audited; deletes payment tokens and clears the customer's data (Phase M-2). */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const admin = await requirePermission(req, "customer", "anonymize");
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
  const result = await anonymizeCustomer(prisma, { customerId: params.id, reason: parsed.data.reason, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(result);
});
