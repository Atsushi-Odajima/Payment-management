// Single-row global settings (GlobalSetting id "global"). Later phases add
// columns here; readers always get defaults when the row does not exist yet.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { REGISTRATION_NO_RE, TAX_ROUNDINGS, isTaxRounding } from "@/lib/settlements/types";

export const GLOBAL_SETTING_ID = "global";

export const globalSettingsSchema = z.object({
  /** Whether the viewer role may export CSV. */
  viewerCsvExport: z.boolean(),
  /** Slack Incoming Webhook URL ("" clears it). */
  slackWebhookUrl: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\/hooks\.slack\.com\//.test(v), "slack_url").default(""),
  // ── Qualified-invoice issuer (Phase K-3) ────────────────────────────────
  issuerName: z.string().trim().max(120, "tooLong").default(""),
  /** "T" + 13 digits (the Japanese qualified-invoice issuer registration number), or empty. */
  issuerRegistrationNo: z.string().trim().max(14, "tooLong").refine((v) => v === "" || REGISTRATION_NO_RE.test(v), "registrationNo").default(""),
  issuerAddress: z.string().trim().max(200, "tooLong").default(""),
  issuerTel: z.string().trim().max(30, "tooLong").default(""),
  /** Rounding of the consumption tax per rate: floor (default) | round | ceil. */
  taxRounding: z.enum(TAX_ROUNDINGS).default("floor"),
});
export type GlobalSettingsInput = z.infer<typeof globalSettingsSchema>;

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsInput = { viewerCsvExport: false, slackWebhookUrl: "", issuerName: "", issuerRegistrationNo: "", issuerAddress: "", issuerTel: "", taxRounding: "floor" };

const SELECT = { viewerCsvExport: true, slackWebhookUrl: true, issuerName: true, issuerRegistrationNo: true, issuerAddress: true, issuerTel: true, taxRounding: true } as const;

type Row = { viewerCsvExport: boolean; slackWebhookUrl: string | null; issuerName: string | null; issuerRegistrationNo: string | null; issuerAddress: string | null; issuerTel: string | null; taxRounding: string };

function fromRow(row: Row): GlobalSettingsInput {
  return {
    viewerCsvExport: row.viewerCsvExport,
    slackWebhookUrl: row.slackWebhookUrl ?? "",
    issuerName: row.issuerName ?? "",
    issuerRegistrationNo: row.issuerRegistrationNo ?? "",
    issuerAddress: row.issuerAddress ?? "",
    issuerTel: row.issuerTel ?? "",
    taxRounding: isTaxRounding(row.taxRounding) ? row.taxRounding : "floor",
  };
}

export async function loadGlobalSettings(db: PrismaClient): Promise<GlobalSettingsInput> {
  const row = await db.globalSetting.findUnique({ where: { id: GLOBAL_SETTING_ID }, select: SELECT });
  return row ? fromRow(row) : DEFAULT_GLOBAL_SETTINGS;
}

export async function saveGlobalSettings(db: PrismaClient, input: GlobalSettingsInput, audit: AuditContext): Promise<GlobalSettingsInput> {
  const before = await loadGlobalSettings(db);
  return db.$transaction(async (tx) => {
    const data = {
      viewerCsvExport: input.viewerCsvExport,
      slackWebhookUrl: input.slackWebhookUrl || null,
      issuerName: input.issuerName || null,
      issuerRegistrationNo: input.issuerRegistrationNo || null,
      issuerAddress: input.issuerAddress || null,
      issuerTel: input.issuerTel || null,
      taxRounding: input.taxRounding,
    };
    const row = await tx.globalSetting.upsert({ where: { id: GLOBAL_SETTING_ID }, update: data, create: { id: GLOBAL_SETTING_ID, ...data }, select: SELECT });
    const after = fromRow(row);
    await recordAudit(tx, audit, { action: "global_setting.update", targetType: "global_setting", targetId: GLOBAL_SETTING_ID, before: { ...before, slackWebhookUrl: before.slackWebhookUrl ? "[set]" : "" }, after: { ...after, slackWebhookUrl: after.slackWebhookUrl ? "[set]" : "" } });
    return after;
  });
}
