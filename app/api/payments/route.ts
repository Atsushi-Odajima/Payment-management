import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { auditContextFromRequest } from "@/lib/audit";
import { clientIpFromHeaders } from "@/lib/ip";
import { createTransaction, createTransactionSchema } from "@/lib/payments/create";

/**
 * POST /api/payments — record a transaction (payment application) created at
 * checkout. The rules live in lib/payments/create.ts and are shared with
 * payment-link checkouts and subscription charges.
 */
export const POST = withApiHandler(async (req) => {
  const body = createTransactionSchema.parse(await readJson(req));
  const idempotencyKey = req.headers.get("idempotency-key") ?? body.idempotencyKey;
  const result = await createTransaction(prisma, { ...body, idempotencyKey }, { clientIp: clientIpFromHeaders((n) => req.headers.get(n)), audit: await auditContextFromRequest(req) });
  return ok(result, { status: result.replayed ? 200 : 201 });
});
