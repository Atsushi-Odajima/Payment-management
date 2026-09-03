import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { sendSlack } from "@/lib/notifications/deliver";

const Body = z.object({ url: z.string().trim().max(500).optional() });

/** POST /api/global-settings/slack-test { url? } — post a test message to the given (or saved) Incoming Webhook URL; admin only. */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "global_setting", "update");
  const body = Body.parse(await readJson(req));
  if (body.url && !/^https:\/\/hooks\.slack\.com\//.test(body.url)) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { slackWebhookUrl: "slack_url" } });
  const result = await sendSlack(prisma, { text: `:white_check_mark: Wire Pay notification test by ${admin.loginId}`, url: body.url || undefined });
  return ok(result);
});
