// Server-only half of the API key helpers: key generation and hashing need
// node:crypto, which must not reach client bundles (the pure helpers, types
// and constants stay in ./api-keys so client components can import them).

import { createHash, randomBytes } from "node:crypto";
import { displayPrefix, type ApiKeyKind, type ApiKeyMode } from "./api-keys";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** `wp_<mode>_<ak|ss>_<32 random chars>` — the prefix tells mode and kind at a glance. */
export function generateApiKey(mode: ApiKeyMode, kind: ApiKeyKind): { plaintext: string; keyPrefix: string } {
  const bytes = randomBytes(32);
  let body = "";
  for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  const plaintext = `wp_${mode}_${kind === "api_key" ? "ak" : "ss"}_${body}`;
  return { plaintext, keyPrefix: displayPrefix(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
