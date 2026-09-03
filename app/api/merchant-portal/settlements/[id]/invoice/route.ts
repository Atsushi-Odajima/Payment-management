import { prisma } from "@/lib/db";
import { ApiError, withApiHandler } from "@/lib/api/handler";
import { merchantAuditContext, recordAudit, requestIp } from "@/lib/audit";
import { requireMerchant } from "@/lib/merchant-portal/session";
import { pdfResponse } from "@/lib/pdf/document";
import { buildInvoicePdf } from "@/lib/pdf/invoice";

/** GET /api/merchant-portal/settlements/:id/invoice — the merchant's own qualified invoice PDF (confirmed batches). */
export const GET = withApiHandler<{ params: { id: string } }>(
  async (req, { params }) => {
    const merchant = await requireMerchant(prisma, req);
    const batch = await prisma.settlementBatch.findFirst({ where: { id: params.id, merchantId: merchant.id }, select: { id: true } });
    if (!batch) throw new ApiError(404, "not_found", "errors.notFound");
    const pdf = await buildInvoicePdf(prisma, batch.id);
    await recordAudit(prisma, merchantAuditContext(merchant.id, requestIp(req)), { action: "settlement.invoice_export", targetType: "settlement", targetId: batch.id, after: { invoiceNo: pdf.invoiceNo, portal: true } });
    return pdfResponse(pdf.bytes, pdf.filename);
  },
  { ipRestricted: false },
);
