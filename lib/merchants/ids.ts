import type { Prisma } from "@prisma/client";
import { formatMerchantCode, parseMerchantCode } from "./types";

/**
 * Next sequential merchant code (MER-00001, MER-00002 …).
 * Codes are zero-padded so lexical order equals numeric order, which lets us
 * take the max with a single ordered query. The unique constraint on
 * merchantCode is the real guard against a concurrent duplicate; callers
 * retry once on P2002.
 */
export async function nextMerchantCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.merchant.findFirst({
    orderBy: { merchantCode: "desc" },
    select: { merchantCode: true },
  });
  const n = last ? (parseMerchantCode(last.merchantCode) ?? 0) : 0;
  return formatMerchantCode(n + 1);
}
