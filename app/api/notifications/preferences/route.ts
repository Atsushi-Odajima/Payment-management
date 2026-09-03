import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/lib/api/role-guard";
import { loadPreferences, savePreferences } from "@/lib/notifications/list";
import { NOTIFICATION_KINDS } from "@/lib/notifications/types";
import { loadGlobalSettings } from "@/lib/settings/global";

const Body = z.object({
  preferences: z.array(z.object({ kind: z.enum(NOTIFICATION_KINDS), email: z.boolean(), slack: z.boolean() })).max(NOTIFICATION_KINDS.length),
});

/** GET /api/notifications/preferences — the signed-in admin's channel choices per kind (+ whether Slack is configured). */
export const GET = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const [preferences, settings] = await Promise.all([loadPreferences(prisma, admin.id), loadGlobalSettings(prisma)]);
  return ok({ preferences, slackConfigured: !!settings.slackWebhookUrl });
});

/** PUT /api/notifications/preferences — replace the admin's own choices (in-app is always on). */
export const PUT = withApiHandler(async (req) => {
  const admin = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { preferences: "invalid" } });
  return ok({ preferences: await savePreferences(prisma, admin.id, parsed.data.preferences) });
});
