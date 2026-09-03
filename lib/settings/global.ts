// Single-row global settings (GlobalSetting id "global"). Later phases add
// columns here; readers always get defaults when the row does not exist yet.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { recordAudit, type AuditContext } from "@/lib/audit";

export const GLOBAL_SETTING_ID = "global";

export const globalSettingsSchema = z.object({
  /** Whether the viewer role may export CSV. */
  viewerCsvExport: z.boolean(),
  /** Slack Incoming Webhook URL ("" clears it). */
  slackWebhookUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/hooks\.slack\.com\//.test(v), "slack_url").default(""),
});
export type GlobalSettingsInput = z.infer<typeof globalSettingsSchema>;

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsInput = { viewerCsvExport: false, slackWebhookUrl: "" };

const SELECT = { viewerCsvExport: true, slackWebhookUrl: true } as const;

export async function loadGlobalSettings(db: PrismaClient): Promise<GlobalSettingsInput> {
  const row = await db.globalSetting.findUnique({ where: { id: GLOBAL_SETTING_ID }, select: SELECT });
  return row ? { viewerCsvExport: row.viewerCsvExport, slackWebhookUrl: row.slackWebhookUrl ?? "" } : DEFAULT_GLOBAL_SETTINGS;
}

export async function saveGlobalSettings(db: PrismaClient, input: GlobalSettingsInput, audit: AuditContext): Promise<GlobalSettingsInput> {
  const before = await loadGlobalSettings(db);
  return db.$transaction(async (tx) => {
    const data = { viewerCsvExport: input.viewerCsvExport, slackWebhookUrl: input.slackWebhookUrl || null };
    const row = await tx.globalSetting.upsert({ where: { id: GLOBAL_SETTING_ID }, update: data, create: { id: GLOBAL_SETTING_ID, ...data }, select: SELECT });
    const after = { viewerCsvExport: row.viewerCsvExport, slackWebhookUrl: row.slackWebhookUrl ?? "" };
    await recordAudit(tx, audit, { action: "global_setting.update", targetType: "global_setting", targetId: GLOBAL_SETTING_ID, before: { ...before, slackWebhookUrl: before.slackWebhookUrl ? "[set]" : "" }, after: { ...after, slackWebhookUrl: after.slackWebhookUrl ? "[set]" : "" } });
    return after;
  });
}
