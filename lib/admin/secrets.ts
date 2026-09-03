// AES-GCM wrapping of TOTP secrets. This is the third module allowed to
// import lib/crypto (see .eslintrc.json no-restricted-imports).

import { decrypt, encrypt } from "@/lib/crypto";

export function encryptTotpSecret(secretBase32: string): string {
  return encrypt(secretBase32);
}

export function decryptTotpSecret(ciphertext: string): string {
  return decrypt(ciphertext);
}
