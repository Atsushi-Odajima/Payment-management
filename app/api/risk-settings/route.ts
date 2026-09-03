import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireMaster } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadRiskSettings, saveRiskSettings } from "@/lib/risk/service";
import { riskSettingsSchema } from "@/lib/risk/types";

/** GET /api/risk-settings — detection thresholds. */
export const GET = withApiHandler(async () => ok(await loadRiskSettings(prisma)));

/** PUT /api/risk-settings — master: window (minutes) and failure count. */
export const PUT = withApiHandler(async (req) => {
  await requireMaster(req);
  const parsed = riskSettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  return ok(await saveRiskSettings(prisma, parsed.data, await auditContextFromRequest(req)));
});
