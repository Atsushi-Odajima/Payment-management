// Merchant API keys and signing secrets (B-4). The database keeps only a
// SHA-256 hash; the plaintext is shown once when issued or rotated. A
// rotated key stays valid until expiresAt so the merchant can switch over.
// This module is client-safe; generation / hashing live in ./api-keys-server.

export const API_KEY_MODES = ["test", "live"] as const;
export type ApiKeyMode = (typeof API_KEY_MODES)[number];
export const API_KEY_KINDS = ["api_key", "signing_secret"] as const;
export type ApiKeyKind = (typeof API_KEY_KINDS)[number];
export const API_KEY_STATUSES = ["active", "expiring", "expired", "revoked"] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export function isApiKeyMode(v: unknown): v is ApiKeyMode {
  return v === "test" || v === "live";
}
export function isApiKeyKind(v: unknown): v is ApiKeyKind {
  return v === "api_key" || v === "signing_secret";
}

/** Days a rotated key keeps working by default. */
export const ROTATION_GRACE_DAYS = 7;
export const MAX_ROTATION_GRACE_DAYS = 90;

/** First 16 characters + ellipsis, enough to recognise a key without revealing it. */
export function displayPrefix(plaintext: string): string {
  return `${plaintext.slice(0, 16)}…`;
}

export function looksLikeApiKey(s: string): boolean {
  return /^wp_(test|live)_(ak|ss)_[A-Za-z0-9]{32}$/.test(s);
}

export function apiKeyStatus(row: { expiresAt: Date | null; revokedAt: Date | null }, now: Date = new Date()): ApiKeyStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt) return row.expiresAt.getTime() <= now.getTime() ? "expired" : "expiring";
  return "active";
}

/** Whether a key may authenticate a request right now. */
export function apiKeyUsable(row: { expiresAt: Date | null; revokedAt: Date | null }, now: Date = new Date()): boolean {
  const s = apiKeyStatus(row, now);
  return s === "active" || s === "expiring";
}

export const API_KEY_SELECT = {
  id: true,
  merchantId: true,
  mode: true,
  kind: true,
  label: true,
  keyPrefix: true,
  issuedAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
} as const;

export interface ApiKeyView {
  id: string;
  mode: ApiKeyMode;
  kind: ApiKeyKind;
  label: string | null;
  keyPrefix: string;
  status: ApiKeyStatus;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export function toApiKeyView(
  row: { id: string; mode: string; kind: string; label: string | null; keyPrefix: string; issuedAt: Date; expiresAt: Date | null; revokedAt: Date | null; lastUsedAt: Date | null },
  now: Date = new Date(),
): ApiKeyView {
  return {
    id: row.id,
    mode: isApiKeyMode(row.mode) ? row.mode : "test",
    kind: isApiKeyKind(row.kind) ? row.kind : "api_key",
    label: row.label,
    keyPrefix: row.keyPrefix,
    status: apiKeyStatus(row, now),
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
  };
}
