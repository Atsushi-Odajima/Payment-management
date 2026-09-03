import { formatCode, parseCode } from "@/lib/ids";
import type { PaymentMethod } from "@/lib/payments/methods";
import type { TransferIdDigits } from "@/lib/payments/transfer";

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

export { ROLES, isRole, type Role } from "@/lib/role";

function includes<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

export const isNotifyFormat = (v: unknown): v is NotifyFormat => includes(NOTIFY_FORMATS, v);
export const isNotifyParamSet = (v: unknown): v is NotifyParamSet => includes(NOTIFY_PARAM_SETS, v);
export const isNotifyIdFormat = (v: unknown): v is NotifyIdFormat => includes(NOTIFY_ID_FORMATS, v);
export const isEmailNotification = (v: unknown): v is EmailNotification =>
  includes(EMAIL_NOTIFICATIONS, v);

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
  /** Referring agent id, or null. */
  agentId: string | null;
  /** Payment methods the merchant may offer at checkout (e.g. ["credit","qr"]). */
  enabledMethods: PaymentMethod[];
  /** Length of the bank-transfer ids issued to this merchant's customers. */
  transferIdDigits: TransferIdDigits;
}

/** What the UI receives — never includes the password. */
export interface MerchantView extends MerchantInput {
  id: string;
  merchantCode: string;
  agent: { id: string; agentCode: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Option shown in the merchant form's agent select. */
export interface AgentOption {
  id: string;
  agentCode: string;
  name: string;
  status: string;
}

export function parseEnabledMethods(json: string): PaymentMethod[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const out: PaymentMethod[] = [];
    for (const x of v) {
      if (typeof x === "string" && (["credit", "qr", "convenience", "bank", "other"] as const).some((m) => m === x)) {
        out.push(x as PaymentMethod);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export const MERCHANT_CODE_PREFIX_BARE = "MER";
export const MERCHANT_CODE_PREFIX = `${MERCHANT_CODE_PREFIX_BARE}-`;

export function formatMerchantCode(n: number): string {
  return formatCode(MERCHANT_CODE_PREFIX_BARE, n);
}

export function parseMerchantCode(code: string): number | null {
  return parseCode(MERCHANT_CODE_PREFIX_BARE, code);
}
