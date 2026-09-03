import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { authenticatePublicApi, rateLimitHeaders } from "@/lib/public-api/auth";
import { createTransactionApiSchema, listTransactionsQuerySchema } from "@/lib/public-api/schemas";
import { createApiTransaction, listApiTransactions } from "@/lib/public-api/transactions";

/** POST /api/v1/transactions — create a transaction for the key's merchant / environment (Phase L-1). */
export const POST = withApiHandler(
  async (req) => {
    const ctx = await authenticatePublicApi(prisma, req);
    const parsed = createTransactionApiSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
    const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
    const result = await createApiTransaction(prisma, ctx, parsed.data, idempotencyKey);
    return ok(result.transaction, { status: result.replayed ? 200 : 201, headers: rateLimitHeaders(ctx.rateLimit) });
  },
  { ipRestricted: false },
);

/** GET /api/v1/transactions — list the merchant's transactions of the key's environment. */
export const GET = withApiHandler(
  async (req) => {
    const ctx = await authenticatePublicApi(prisma, req);
    const parsed = listTransactionsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
    return ok(await listApiTransactions(prisma, ctx, parsed.data), { headers: rateLimitHeaders(ctx.rateLimit) });
  },
  { ipRestricted: false },
);
