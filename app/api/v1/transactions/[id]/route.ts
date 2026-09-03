import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { authenticatePublicApi, rateLimitHeaders } from "@/lib/public-api/auth";
import { getApiTransaction } from "@/lib/public-api/transactions";

/** GET /api/v1/transactions/:id — one transaction; other merchants' / environments' ids answer 404. */
export const GET = withApiHandler<{ params: { id: string } }>(
  async (req, { params }) => {
    const ctx = await authenticatePublicApi(prisma, req);
    const t = await getApiTransaction(prisma, ctx, params.id);
    if (!t) throw new ApiError(404, "not_found", "errors.notFound");
    return ok(t, { headers: rateLimitHeaders(ctx.rateLimit) });
  },
  { ipRestricted: false },
);
