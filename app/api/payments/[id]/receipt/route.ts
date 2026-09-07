import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin, requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { pdfResponse } from "@/lib/pdf/document";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { issueReceipt } from "@/lib/receipts/service";

type Ctx = { params: { id: string } };

const Body = z.object({ recipientName: z.string().trim().max(120).optional(), description: z.string().trim().max(120).optional() });

/**
 * POST /api/payments/:id/receipt — issue (or re-issue) the receipt of a
 * completed transaction (Phase K-2, permission receipt.issue, audited).
 * Returns the receipt row; the PDF is fetched with GET.
 */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  const admin = await requirePermission(req, "receipt", "issue");
  const body = Body.parse(await readJson(req));
  const row = await issueReceipt(prisma, { paymentId: params.id, recipientName: body.recipientName, description: body.description, source: "dashboard", issuedById: admin.id, audit: await auditContextFromRequest(req) });
  return ok(row);
});

/** GET /api/payments/:id/receipt — the receipt PDF (login required; 404 until issued). */
export const GET = withApiHandler<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const exists = await prisma.receipt.findUnique({ where: { paymentId: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  const pdf = await buildReceiptPdf(prisma, params.id);
  return pdfResponse(pdf.bytes, pdf.filename);
});
