import { describe, expect, it } from "vitest";
import { apiKeyStatus, apiKeyUsable, displayPrefix, looksLikeApiKey } from "./api-keys";
import { generateApiKey, hashApiKey } from "./api-keys-server";

describe("merchant API keys", () => {
  it("generates keys whose prefix tells the mode and kind", () => {
    const k = generateApiKey("live", "signing_secret");
    expect(k.plaintext).toMatch(/^wp_live_ss_[A-Za-z0-9]{32}$/);
    expect(k.keyPrefix).toBe(displayPrefix(k.plaintext));
    expect(k.keyPrefix).toHaveLength(17);
    expect(looksLikeApiKey(k.plaintext)).toBe(true);
    expect(looksLikeApiKey("sk_live_abc")).toBe(false);
    expect(generateApiKey("test", "api_key").plaintext).not.toBe(generateApiKey("test", "api_key").plaintext);
  });

  it("hashes deterministically", () => {
    expect(hashApiKey("wp_test_ak_x")).toBe(hashApiKey("wp_test_ak_x"));
    expect(hashApiKey("wp_test_ak_x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("derives the status from expiry and revocation", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const later = new Date("2026-09-08T00:00:00Z");
    expect(apiKeyStatus({ expiresAt: null, revokedAt: null }, now)).toBe("active");
    expect(apiKeyStatus({ expiresAt: later, revokedAt: null }, now)).toBe("expiring");
    expect(apiKeyStatus({ expiresAt: later, revokedAt: null }, later)).toBe("expired");
    expect(apiKeyStatus({ expiresAt: later, revokedAt: now }, now)).toBe("revoked");
    expect(apiKeyUsable({ expiresAt: later, revokedAt: null }, now)).toBe(true);
    expect(apiKeyUsable({ expiresAt: later, revokedAt: null }, later)).toBe(false);
    expect(apiKeyUsable({ expiresAt: null, revokedAt: now }, now)).toBe(false);
  });
});
