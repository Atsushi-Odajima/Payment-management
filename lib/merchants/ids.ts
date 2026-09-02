import type { Prisma } from "@prisma/client";
import { nextCode } from "@/lib/ids";
import { MERCHANT_CODE_PREFIX_BARE } from "./types";

/** Next sequential merchant code (MER-00001, MER-00002 …). */
export async function nextMerchantCode(tx: Prisma.TransactionClient): Promise<string> {
  return nextCode(MERCHANT_CODE_PREFIX_BARE, async () => {
    const last = await tx.merchant.findFirst({
      orderBy: { merchantCode: "desc" },
      select: { merchantCode: true },
    });
    return last?.merchantCode ?? null;
  });
}
