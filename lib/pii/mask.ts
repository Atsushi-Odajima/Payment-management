// Personal-data masking (Phase M-2). Pure, client-safe. Operator screens and
// CSV exports show these forms; the full value is revealed only through the
// audited unmask action (pii.unmask) or to the merchant that owns the data.
//
//   name   → family name only            "山田 太郎" → "山田 ＊＊", "Taro Yamada" → "Taro ＊＊"
//   email  → first 2 chars + *** @ domain  "taro@example.com" → "ta***@example.com"
//   phone  → last 4 digits                "090-1234-5678" → "***-****-5678"
//   IP     → 4th octet hidden             "203.0.113.42" → "203.0.113.***"

export const MASK = "＊＊";

export function maskName(name: string | null | undefined): string | null {
  if (!name) return name ?? null;
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) return `${parts[0]} ${MASK}`;
  // No separator: keep the first character (or two for long names).
  const keep = Array.from(trimmed).slice(0, trimmed.length > 4 ? 2 : 1).join("");
  return `${keep}${MASK}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `***-****-${digits.slice(-4)}`;
}

export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return ip ?? null;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip.trim());
  if (m) return `${m[1]}.${m[2]}.${m[3]}.***`;
  // IPv6 or anything else: keep the first block.
  const idx = ip.indexOf(":");
  return idx > 0 ? `${ip.slice(0, idx)}:***` : "***";
}

/** Keys of audit snapshots / generic objects that carry personal data, by pattern. */
const NAME_KEYS = /^(customerName|payerName|recipientName|contactName|holderName|bankAccountHolder)$/;
const EMAIL_KEYS = /email/i;
const PHONE_KEYS = /^(phone|tel|issuerTel)$/i;
const IP_KEYS = /^(ip|clientIp)$/;

export function maskValueForKey(key: string, value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  if (NAME_KEYS.test(key)) return maskName(value);
  if (EMAIL_KEYS.test(key)) return maskEmail(value);
  if (PHONE_KEYS.test(key)) return maskPhone(value);
  if (IP_KEYS.test(key)) return maskIp(value);
  return value;
}

/** Deep-mask every personal-data key of a plain object / array. */
export function maskDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskDeep) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = v && typeof v === "object" && !(v instanceof Date) ? maskDeep(v) : maskValueForKey(k, v);
    return out as T;
  }
  return value;
}

export type PiiMode = "masked" | "full";

/** Mask the customer-facing columns of a transaction-like row. */
export function maskCustomerFields<T extends { customerName?: string | null; customerEmail?: string | null; clientIp?: string | null }>(row: T, mode: PiiMode): T {
  if (mode === "full") return row;
  return { ...row, ...(row.customerName !== undefined ? { customerName: maskName(row.customerName) } : {}), ...(row.customerEmail !== undefined ? { customerEmail: maskEmail(row.customerEmail) } : {}), ...(row.clientIp !== undefined ? { clientIp: maskIp(row.clientIp) } : {}) };
}
