import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateMerchantInput } from "@/lib/merchants/schema";
import { MERCHANT_SELECT } from "../select";

type Ctx = { params: { id: string } };

export const GET = withApiHandler<Ctx>(async (_req, { params }) => {
  const merchant = await prisma.merchant.findUnique({ where: { id: params.id }, select: MERCHANT_SELECT });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(merchant);
});

/** PATCH /api/merchants/:id — update editable fields (code/password are immutable here). */
export const PATCH = withApiHandler<Ctx>(async (req, { params }) => {
  const v = validateMerchantInput(await readJson(req));
  if (!v.ok) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  }
  const exists = await prisma.merchant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  const updated = await prisma.merchant.update({
    where: { id: params.id },
    data: v.data,
    select: MERCHANT_SELECT,
  });
  return ok(updated);
});
