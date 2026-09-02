import { describe, expect, it, vi } from "vitest";
import { DecryptionError, EncryptionKeyError, decrypt, encrypt, getKey, maskSecret } from "./crypto";

const OTHER_KEY = "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=";

describe("crypto", () => {
  it("round-trips plaintext", () => {
    const ct = encrypt("sk_test_123");
    expect(ct).not.toContain("sk_test_123");
    expect(decrypt(ct)).toBe("sk_test_123");
  });

  it("uses a fresh IV per call", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("throws DecryptionError when the auth tag is tampered", () => {
    const [iv, tag, data] = encrypt("secret").split(":");
    const flipped = Buffer.from(tag, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt(`${iv}:${flipped.toString("base64")}:${data}`)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when decrypted with a different key", () => {
    const ct = encrypt("secret");
    vi.stubEnv("ENCRYPTION_KEY", OTHER_KEY);
    expect(() => decrypt(ct)).toThrow(DecryptionError);
  });

  it("throws DecryptionError on malformed payloads", () => {
    expect(() => decrypt("not-a-ciphertext")).toThrow(DecryptionError);
    expect(() => decrypt("a:b")).toThrow(DecryptionError);
  });

  it("returns empty string for empty input", () => {
    expect(decrypt("")).toBe("");
  });

  it("fails closed in production when the key is missing or malformed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => getKey()).toThrow(EncryptionKeyError);
    vi.stubEnv("ENCRYPTION_KEY", "too-short");
    expect(() => getKey()).toThrow(EncryptionKeyError);
    vi.stubEnv("ENCRYPTION_KEY", "REPLACE_WITH_32BYTE_BASE64_KEY");
    expect(() => getKey()).toThrow(EncryptionKeyError);
  });

  it("rejects a malformed key even outside production", () => {
    vi.stubEnv("ENCRYPTION_KEY", "definitely-not-base64-32-bytes");
    expect(() => getKey()).toThrow(EncryptionKeyError);
  });

  it("masks with a constant number of bullets", () => {
    expect(maskSecret("sk_live_abcdefgh")).toBe("••••••••efgh");
    expect(maskSecret("abcdefghijklmnopqrstuvwxyz")).toBe("••••••••wxyz");
    expect(maskSecret("ab")).toBe("••••••••");
    expect(maskSecret("")).toBe("");
  });
});
