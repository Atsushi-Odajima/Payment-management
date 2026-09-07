// Single-row global settings (GlobalSetting id "global"). Later phases add
// columns here; readers always get defaults when the row does not exist yet.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { REGISTRATION_NO_RE, TAX_ROUNDINGS, isTaxRounding } from "@/lib/settlements/types";

export const GLOBAL_SETTING_ID = "global";

export const CSV_PII_MODES = ["masked", "full"] as const;
export type CsvPiiMode = (typeof CSV_PII_MODES)[number];

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
  // ── Personal data (Phase M-2) ───────────────────────────────────────────
  /** Customers without a transaction for this many months are anonymised (1–120). */
  piiRetentionMonths: z.number({ invalid_type_error: "number" }).int("integer").min(1, "range").max(120, "range").default(24),
  /** Audit rows older than this many years are pruned (1–30). */
  auditRetentionYears: z.number({ invalid_type_error: "number" }).int("integer").min(1, "range").max(30, "range").default(7),
  /** CSV exports: masked (default) | full (admin / accounting only). */
  csvPii: z.enum(CSV_PII_MODES).default("masked"),
  // ── IP allow-list mode (Phase P4-1) ─────────────────────────────────────
  /** Admin UI / API: block callers that match no enabled allow rule (deny rules always win). */
  ipAllowlistAdmin: z.boolean().default(false),
  /** Merchant API (/api/merchant-api, /api/v1): same, per merchant's own allow rules. */
  ipAllowlistMerchantApi: z.boolean().default(false),
});
export type GlobalSettingsInput = z.infer<typeof globalSettingsSchema>;

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsInput = {
  viewerCsvExport: false,
  slackWebhookUrl: "",
  issuerName: "",
  issuerRegistrationNo: "",
  issuerAddress: "",
  issuerTel: "",
  taxRounding: "floor",
  piiRetentionMonths: 24,
  auditRetentionYears: 7,
  csvPii: "masked",
  ipAllowlistAdmin: false,
  ipAllowlistMerchantApi: false,
};

const SELECT = { viewerCsvExport: true, slackWebhookUrl: true, issuerName: true, issuerRegistrationNo: true, issuerAddress: true, issuerTel: true, taxRounding: true, piiRetentionMonths: true, auditRetentionYears: true, csvPii: true, ipAllowlistAdmin: true, ipAllowlistMerchantApi: true } as const;

type Row = { viewerCsvExport: boolean; slackWebhookUrl: string | null; issuerName: string | null; issuerRegistrationNo: string | null; issuerAddress: string | null; issuerTel: string | null; taxRounding: string; piiRetentionMonths: number; auditRetentionYears: number; csvPii: string; ipAllowlistAdmin: boolean; ipAllowlistMerchantApi: boolean };

function fromRow(row: Row): GlobalSettingsInput {
  return {
    viewerCsvExport: row.viewerCsvExport,
    slackWebhookUrl: row.slackWebhookUrl ?? "",
    issuerName: row.issuerName ?? "",
    issuerRegistrationNo: row.issuerRegistrationNo ?? "",
    issuerAddress: row.issuerAddress ?? "",
    issuerTel: row.issuerTel ?? "",
    taxRounding: isTaxRounding(row.taxRounding) ? row.taxRounding : "floor",
    piiRetentionMonths: row.piiRetentionMonths,
    auditRetentionYears: row.auditRetentionYears,
    csvPii: row.csvPii === "full" ? "full" : "masked",
    ipAllowlistAdmin: row.ipAllowlistAdmin,
    ipAllowlistMerchantApi: row.ipAllowlistMerchantApi,
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
      piiRetentionMonths: input.piiRetentionMonths,
      auditRetentionYears: input.auditRetentionYears,
      csvPii: input.csvPii,
      ipAllowlistAdmin: input.ipAllowlistAdmin,
      ipAllowlistMerchantApi: input.ipAllowlistMerchantApi,
    };
    const row = await tx.globalSetting.upsert({ where: { id: GLOBAL_SETTING_ID }, update: data, create: { id: GLOBAL_SETTING_ID, ...data }, select: SELECT });
    const after = fromRow(row);
    await recordAudit(tx, audit, { action: "global_setting.update", targetType: "global_setting", targetId: GLOBAL_SETTING_ID, before: { ...before, slackWebhookUrl: before.slackWebhookUrl ? "[set]" : "" }, after: { ...after, slackWebhookUrl: after.slackWebhookUrl ? "[set]" : "" } });
    return after;
  });
}
