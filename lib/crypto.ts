import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PLACEHOLDER_KEY = "REPLACE_WITH_32BYTE_BASE64_KEY";

/** Thrown when ENCRYPTION_KEY is missing or malformed. */
export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

/** Thrown when a ciphertext cannot be decrypted (wrong key, tampered, malformed). */
export class DecryptionError extends Error {
  constructor(message = "Ciphertext could not be decrypted") {
    super(message);
    this.name = "DecryptionError";
  }
}

let warnedDevKey = false;

/**
 * Resolve the AES-256 key from ENCRYPTION_KEY (base64, exactly 32 bytes).
 *
 * Fail-closed: in production a missing or malformed key throws so the app
 * never silently runs with a predictable key. In development only, a fixed
 * dev key is derived (with a one-time warning) so the demo boots without
 * configuration.
 */
export function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && raw !== PLACEHOLDER_KEY) {
    // Buffer.from(..., "base64") never throws, so validate the shape
    // explicitly: 32 bytes in canonical base64 is exactly 43 chars + "=".
    const buf = Buffer.from(raw, "base64");
    if (buf.length === KEY_LENGTH && /^[A-Za-z0-9+/]{43}=$/.test(raw)) {
      return buf;
    }
    throw new EncryptionKeyError(
      "ENCRYPTION_KEY must be a base64-encoded 32-byte value",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new EncryptionKeyError(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  if (!warnedDevKey) {
    warnedDevKey = true;
    console.warn(
      "[crypto] ENCRYPTION_KEY not set — using an insecure development key. Never do this in production.",
    );
  }
  return createHash("sha256").update("payment-management:dev:key").digest();
}

export function encrypt(plaintext: string): string {
  if (plaintext == null) return "";
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by encrypt(). Throws DecryptionError on any
 * failure (malformed payload, wrong key, tampered data) — callers decide how
 * to surface it. Empty input returns "".
 */
export function decrypt(payload: string): string {
  if (!payload) return "";
  const [ivB64, tagB64, dataB64, extra] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64 || extra !== undefined) {
    throw new DecryptionError("Malformed ciphertext");
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new DecryptionError("Malformed ciphertext");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}

/**
 * Mask a secret for display: a fixed number of bullets plus the last
 * `visible` characters. The bullet count is constant so the mask does not
 * leak the plaintext length.
 */
export function maskSecret(value: string | undefined | null, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "•".repeat(8);
  return "•".repeat(8) + value.slice(-visible);
}
