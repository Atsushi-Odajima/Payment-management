import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import {
  decryptMerchantPassword,
  encryptMerchantPassword,
  generateMerchantPassword,
} from "@/lib/merchants/secrets";

type Ctx = { params: { id: string } };

/** GET — reveal the merchant password (master role only). */
export const GET = withApiHandler<Ctx>(async (req, { params }) => {
  requireMaster(req);
  const m = await prisma.merchant.findUnique({ where: { id: params.id }, select: { passwordEnc: true } });
  if (!m) throw new ApiError(404, "not_found", "errors.notFound");
  // DecryptionError → 422 "undecryptable" via withApiHandler.
  return ok({ password: decryptMerchantPassword(m.passwordEnc) });
});

/** POST — regenerate the password (master role only); returns the new value once. */
export const POST = withApiHandler<Ctx>(async (req, { params }) => {
  requireMaster(req);
  const exists = await prisma.merchant.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, "not_found", "errors.notFound");
  const password = generateMerchantPassword();
  await prisma.merchant.update({
    where: { id: params.id },
    data: { passwordEnc: encryptMerchantPassword(password) },
  });
  return ok({ password });
});
