import { prisma } from "@/lib/db";
import { withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest, recordAudit } from "@/lib/audit";
import { pdfResponse } from "@/lib/pdf/document";
import { buildInvoicePdf } from "@/lib/pdf/invoice";

/**
 * GET /api/settlements/:id/invoice — qualified invoice PDF of a confirmed
 * (or later) settlement batch (Phase K-3, permission invoice.export). Each
 * export is audited as settlement.invoice_export.
 */
export const GET = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission(req, "invoice", "export");
  const pdf = await buildInvoicePdf(prisma, params.id);
  await recordAudit(prisma, await auditContextFromRequest(req), { action: "settlement.invoice_export", targetType: "settlement", targetId: params.id, after: { invoiceNo: pdf.invoiceNo } });
  return pdfResponse(pdf.bytes, pdf.filename);
});
