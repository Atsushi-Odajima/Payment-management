import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { resolveMode } from "@/lib/mode";
import { generateBatch } from "@/lib/settlements/service";
import { generateBatchSchema } from "@/lib/settlements/types";

/**
 * POST /api/settlements/generate — aggregate one merchant's completed
 * transactions of a period into a batch (demo: manual; production would run
 * this from the cycle cron). Mode comes from `?mode=` or the header cookie.
 */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "settlement", "generate");
  const parsed = generateBatchSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const modeParam = new URL(req.url).searchParams.get("mode");
  const cookieMode = req.headers.get("cookie")?.match(/(?:^|;\s*)wirepay\.mode=(test|live)/)?.[1];
  const livemode = resolveMode(modeParam ?? cookieMode) === "live";
  const batch = await generateBatch(prisma, { ...parsed.data, livemode, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(batch, { status: 201 });
});
