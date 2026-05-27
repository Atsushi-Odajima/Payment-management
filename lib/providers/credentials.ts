import { decrypt, encrypt, maskSecret } from "@/lib/crypto";
import { getProviderDefinition } from "./registry";

export interface CredentialStore {
  // map of fieldKey -> stored value. Secret fields hold AES ciphertext,
  // non-secret fields hold the plaintext value as entered by the user.
  [fieldKey: string]: string;
}

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

export interface ProviderConfigView {
  // safe-to-display credential map: secret fields are masked.
  fields: Record<string, { value: string; masked: boolean }>;
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
      const plain = decrypt(stored);
      fields[field.key] = { value: maskSecret(plain), masked: true };
    } else {
      fields[field.key] = { value: stored, masked: false };
    }
  }
  return { fields };
}

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

function safeParse<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
