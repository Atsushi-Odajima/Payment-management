import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { reviewApplication } from "@/lib/applications/review";
import { REVIEW_DECISIONS } from "@/lib/applications/types";

const Body = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  reason: z.string().max(1000).nullable().optional(),
});

/**
 * POST /api/applications/:id/review — approve / reject / return.
 * Master role only; reject and return require a reason.
 */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  requireMaster(req);
  const body = Body.parse(await readJson(req));
  const result = await reviewApplication(prisma, {
    applicationId: params.id,
    decision: body.decision,
    reason: body.reason ?? null,
  });
  return ok(result);
});
