import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { updateBlacklistEntry } from "@/lib/risk/blacklist";
import { blacklistUpdateSchema } from "@/lib/risk/types";

/** PATCH /api/blacklist/:id — approve (active) / reject a candidate, enable / disable an entry (master). */
export const PATCH = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  await requirePermission(req, "blacklist", "update");
  const parsed = blacklistUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput");
  const row = await updateBlacklistEntry(prisma, { id: params.id, status: parsed.data.status, reason: parsed.data.reason, audit: await auditContextFromRequest(req) });
  return ok(row);
});
