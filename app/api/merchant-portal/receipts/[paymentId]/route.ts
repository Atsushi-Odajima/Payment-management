import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { merchantAuditContext, requestIp } from "@/lib/audit";
import { requireMerchant } from "@/lib/merchant-portal/session";
import { pdfResponse } from "@/lib/pdf/document";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { issueReceipt } from "@/lib/receipts/service";

type Ctx = { params: { paymentId: string } };

const Body = z.object({ recipientName: z.string().trim().max(120).optional(), description: z.string().trim().max(120).optional() });

async function ownPayment(merchantId: string, paymentId: string) {
  const p = await prisma.payment.findFirst({ where: { id: paymentId, merchantId }, select: { id: true } });
  if (!p) throw new ApiError(404, "not_found", "errors.notFound");
  return p;
}

/**
 * POST /api/merchant-portal/receipts/:paymentId — the merchant issues (or
 * re-issues) the receipt of its own completed transaction (Phase P3-8):
 * addressee and description (purpose line) are editable; the row is shared with the operator
 * dashboard (source "merchant", audited as receipt.issue by the merchant).
 */
export const POST = withApiHandler<Ctx>(
  async (req, { params }) => {
    const merchant = await requireMerchant(prisma, req);
    await ownPayment(merchant.id, params.paymentId);
    const body = Body.parse(await readJson(req));
    const row = await issueReceipt(prisma, { paymentId: params.paymentId, recipientName: body.recipientName, description: body.description, source: "merchant", issuedById: null, audit: merchantAuditContext(merchant.id, requestIp(req)) });
    return ok(row);
  },
  { ipRestricted: false },
);

/** GET /api/merchant-portal/receipts/:paymentId — the receipt PDF of the merchant's own transaction (404 until issued). */
export const GET = withApiHandler<Ctx>(
  async (req, { params }) => {
    const merchant = await requireMerchant(prisma, req);
    await ownPayment(merchant.id, params.paymentId);
    const exists = await prisma.receipt.findUnique({ where: { paymentId: params.paymentId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
    const pdf = await buildReceiptPdf(prisma, params.paymentId);
    return pdfResponse(pdf.bytes, pdf.filename);
  },
  { ipRestricted: false },
);
