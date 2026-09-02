import { DecryptionError, decrypt, encrypt, maskSecret } from "@/lib/crypto";
import { getProviderDefinition } from "./registry";

// This module is the ONLY place that touches lib/crypto for provider
// credentials (enforced by ESLint no-restricted-imports). Everything else
// goes through build / merge / read helpers below.

export interface CredentialStore {
  // map of fieldKey -> stored value. Secret fields hold AES ciphertext,
  // non-secret fields hold the plaintext value as entered by the user.
  [fieldKey: string]: string;
}

/** Build a fresh store from user input (create flow). Empty values are skipped. */
export function buildCredentialStore(
  providerKey: string,
  input: Record<string, string | undefined>,
): CredentialStore {
  const def = getProviderDefinition(providerKey);
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);
  const store: CredentialStore = {};
  for (const field of def.fields) {
    const raw = (input[field.key] ?? "").toString();
    if (!raw) continue;
    store[field.key] = field.secret ? encrypt(raw) : raw;
  }
  return store;
}

/**
 * Merge edits into an existing store (edit flow).
 *  - undefined  → untouched
 *  - ""         → secret: keep existing ciphertext / non-secret: remove
 *  - value      → secret: re-encrypt / non-secret: replace
 */
export function mergeCredentialStore(
  providerKey: string,
  existingJson: string,
  input: Record<string, string | undefined>,
): CredentialStore {
  const def = getProviderDefinition(providerKey);
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);
  const merged: CredentialStore = { ...(safeParse<CredentialStore>(existingJson) ?? {}) };
  for (const field of def.fields) {
    const raw = input[field.key];
    if (raw === undefined) continue;
    if (raw === "") {
      if (!field.secret) delete merged[field.key];
      continue;
    }
    merged[field.key] = field.secret ? encrypt(raw) : raw;
  }
  return merged;
}

export interface DisplayField {
  value: string;
  masked: boolean;
  /** true when the stored ciphertext cannot be decrypted with the current key */
  undecryptable?: boolean;
}

export interface ProviderConfigView {
  // safe-to-display credential map: secret fields are masked.
  fields: Record<string, DisplayField>;
}

export function readCredentialsForDisplay(
  providerKey: string,
  storeJson: string,
): ProviderConfigView {
  const def = getProviderDefinition(providerKey);
  const store: CredentialStore = safeParse(storeJson) ?? {};
  const fields: ProviderConfigView["fields"] = {};
  if (!def) return { fields };
  for (const field of def.fields) {
    const stored = store[field.key];
    if (!stored) {
      fields[field.key] = { value: "", masked: false };
      continue;
    }
    if (field.secret) {
      // decrypt only to compute the mask, then discard the plaintext.
      try {
        const plain = decrypt(stored);
        fields[field.key] = { value: maskSecret(plain), masked: true };
      } catch (err) {
        if (err instanceof DecryptionError) {
          fields[field.key] = { value: "", masked: true, undecryptable: true };
        } else {
          throw err;
        }
      }
    } else {
      fields[field.key] = { value: stored, masked: false };
    }
  }
  return { fields };
}

/** Decrypt everything for actual use. Throws DecryptionError on key mismatch. */
export function readCredentialsForUse(
  providerKey: string,
  storeJson: string,
): Record<string, string> {
  const def = getProviderDefinition(providerKey);
  const store: CredentialStore = safeParse(storeJson) ?? {};
  const out: Record<string, string> = {};
  if (!def) return out;
  for (const field of def.fields) {
    const stored = store[field.key];
    if (!stored) continue;
    out[field.key] = field.secret ? decrypt(stored) : stored;
  }
  return out;
}

/** Plaintext keys present in a store (secrets remain encrypted) — for presence checks. */
export function storedFieldKeys(storeJson: string): string[] {
  return Object.keys(safeParse<CredentialStore>(storeJson) ?? {});
}

export function safeParse<T = unknown>(json: string): T | null {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}
