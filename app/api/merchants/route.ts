import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { validateMerchantInput } from "@/lib/merchants/schema";
import { nextMerchantCode } from "@/lib/merchants/ids";
import { encryptMerchantPassword, generateMerchantPassword } from "@/lib/merchants/secrets";
import { DEMO_LIMITS } from "@/lib/demo";
import { MERCHANT_SELECT, serialize, toMerchantData } from "./select";

export const GET = withApiHandler(async () => {
  const merchants = await prisma.merchant.findMany({
    orderBy: { merchantCode: "asc" },
    select: MERCHANT_SELECT,
  });
  return ok({ merchants: merchants.map(serialize) });
});

/**
 * POST /api/merchants — issue a merchant account.
 * merchantCode is auto-numbered and the password auto-generated; neither is
 * accepted from the client. The password is stored encrypted and only
 * revealed through GET /api/merchants/:id/password (master role).
 */
export const POST = withApiHandler(async (req) => {
  const v = validateMerchantInput(await readJson(req));
  if (!v.ok) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: v.errors });
  }
  if (v.data.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: v.data.agentId }, select: { id: true } });
    if (!agent) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { agentId: "invalid" } });
    }
  }
  const count = await prisma.merchant.count();
  if (count >= DEMO_LIMITS.merchants) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.merchants });
  }

  const passwordEnc = encryptMerchantPassword(generateMerchantPassword());

  // Two attempts: a concurrent insert can take the same code; the unique
  // constraint rejects the loser and we recompute once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const merchantCode = await nextMerchantCode(tx);
        return tx.merchant.create({
          data: { ...toMerchantData(v.data), merchantCode, passwordEnc },
          select: MERCHANT_SELECT,
        });
      });
      return ok(serialize(created), { status: 201 });
    } catch (err) {
      if (
        attempt === 0 &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(409, "conflict", "errors.conflict");
});
