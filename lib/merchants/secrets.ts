// Merchant password generation and at-rest encryption.
// One of the two modules allowed to import lib/crypto (see .eslintrc.json).

import { randomInt } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto";

// No 0/O/1/l/I so a password read over the phone is unambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const PASSWORD_LENGTH = 16;

export function generateMerchantPassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function encryptMerchantPassword(plain: string): string {
  return encrypt(plain);
}

/** Throws DecryptionError when the key changed. */
export function decryptMerchantPassword(enc: string): string {
  return decrypt(enc);
}

/** Fixed-width mask shown to every role. */
export const PASSWORD_MASK = "********";
