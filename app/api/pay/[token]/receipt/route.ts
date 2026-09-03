import { prisma } from "@/lib/db";
import { ApiError, withApiHandler } from "@/lib/api/handler";
import { systemAuditContext } from "@/lib/audit";
import { pdfResponse } from "@/lib/pdf/document";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { verifyCustomerReceiptQuery } from "@/lib/receipts/customer-token";
import { issueReceipt } from "@/lib/receipts/service";

/**
 * GET /api/pay/:token/receipt?p=&e=&s= — customer receipt download (Phase K-2).
 * Authenticated by the signed query minted when the checkout completed —
 * not by the admin session — and bound to one transaction of this link.
 * The first download creates the Receipt row (source "customer").
 */
export const GET = withApiHandler<{ params: { token: string } }>(
  async (req, { params }) => {
    const url = new URL(req.url);
    const paymentId = verifyCustomerReceiptQuery(params.token, { p: url.searchParams.get("p"), e: url.searchParams.get("e"), s: url.searchParams.get("s") });
    if (!paymentId) throw new ApiError(403, "receipt_link_invalid", "errors.receiptLinkInvalid");
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, paymentLink: { select: { token: true } } } });
    if (!payment || payment.paymentLink?.token !== params.token) throw new ApiError(404, "not_found", "errors.notFound");
    await issueReceipt(prisma, { paymentId, source: "customer", issuedById: null, audit: systemAuditContext("system") });
    const pdf = await buildReceiptPdf(prisma, paymentId);
    return pdfResponse(pdf.bytes, pdf.filename);
  },
  { ipRestricted: false },
);
