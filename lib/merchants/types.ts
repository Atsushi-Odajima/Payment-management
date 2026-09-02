// Merchant (加盟店) domain vocabulary. Stored as strings (SQLite has no
// enums); narrowed at the boundary with the guards below.

export const NOTIFY_FORMATS = ["json_post", "form_post", "query_get"] as const;
export type NotifyFormat = (typeof NOTIFY_FORMATS)[number];

export const NOTIFY_PARAM_SETS = ["minimal", "standard", "full"] as const;
export type NotifyParamSet = (typeof NOTIFY_PARAM_SETS)[number];

export const NOTIFY_ID_FORMATS = ["payment_id", "transaction_id", "both"] as const;
export type NotifyIdFormat = (typeof NOTIFY_ID_FORMATS)[number];

export const EMAIL_NOTIFICATIONS = ["per_payment", "daily", "none"] as const;
export type EmailNotification = (typeof EMAIL_NOTIFICATIONS)[number];

export const ROLES = ["master", "general"] as const;
export type Role = (typeof ROLES)[number];

function includes<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

export const isNotifyFormat = (v: unknown): v is NotifyFormat => includes(NOTIFY_FORMATS, v);
export const isNotifyParamSet = (v: unknown): v is NotifyParamSet => includes(NOTIFY_PARAM_SETS, v);
export const isNotifyIdFormat = (v: unknown): v is NotifyIdFormat => includes(NOTIFY_ID_FORMATS, v);
export const isEmailNotification = (v: unknown): v is EmailNotification =>
  includes(EMAIL_NOTIFICATIONS, v);
export const isRole = (v: unknown): v is Role => includes(ROLES, v);

/** Editable merchant fields (id / code / password are managed by the system). */
export interface MerchantInput {
  siteName: string;
  siteNameKana: string;
  companyName: string;
  contactName: string;
  email: string;
  statementEmail: string;
  notifyUrl: string;
  notifyFormat: NotifyFormat;
  notifyParamSet: NotifyParamSet;
  notifyIdFormat: NotifyIdFormat;
  emailNotification: EmailNotification;
}

/** What the UI receives — never includes the password. */
export interface MerchantView extends MerchantInput {
  id: string;
  merchantCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MERCHANT_CODE_PREFIX = "MER-";
export const MERCHANT_CODE_DIGITS = 5;

export function formatMerchantCode(n: number): string {
  return `${MERCHANT_CODE_PREFIX}${String(n).padStart(MERCHANT_CODE_DIGITS, "0")}`;
}

export function parseMerchantCode(code: string): number | null {
  const m = new RegExp(`^${MERCHANT_CODE_PREFIX}(\\d{${MERCHANT_CODE_DIGITS},})$`).exec(code);
  return m ? Number(m[1]) : null;
}
