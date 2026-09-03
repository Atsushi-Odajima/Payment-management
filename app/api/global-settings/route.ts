import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { globalSettingsSchema, loadGlobalSettings, saveGlobalSettings } from "@/lib/settings/global";

/** GET /api/global-settings — admin only. */
export const GET = withApiHandler(async (req) => {
  await requirePermission(req, "global_setting", "view");
  return ok(await loadGlobalSettings(prisma));
});

/** PUT /api/global-settings — admin only; audited as global_setting.update. */
export const PUT = withApiHandler(async (req) => {
  await requirePermission(req, "global_setting", "update");
  const parsed = globalSettingsSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  return ok(await saveGlobalSettings(prisma, parsed.data, await auditContextFromRequest(req)));
});
