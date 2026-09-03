import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { toPaymentLinkRow } from "@/lib/payment-links/list";
import { disablePaymentLink } from "@/lib/payment-links/service";

/** POST /api/payment-links/:id/disable — stop a link; existing transactions are untouched. */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission(req, "payment_link", "disable");
  const row = await disablePaymentLink(prisma, { id: params.id, audit: await auditContextFromRequest(req) });
  return ok(toPaymentLinkRow(row));
});
