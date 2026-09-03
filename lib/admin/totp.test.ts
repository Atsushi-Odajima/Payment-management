import { describe, expect, it } from "vitest";
import { currentTotpCode, generateTotpSecret, totpQrSvg, totpUri, verifyTotp } from "./totp";

describe("TOTP", () => {
  it("accepts the current code and its neighbours, rejects others", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-09-03T00:00:15Z");
    const code = currentTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 30_000))).toBe(true); // window ±1
    expect(verifyTotp(secret, code, new Date(now.getTime() + 120_000))).toBe(false);
    expect(verifyTotp(secret, "000000", now)).toBe(code === "000000");
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });

  it("matches the RFC 6238 SHA-1 test vector", () => {
    // Secret "12345678901234567890" (base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), T=59s → 287082 (8 digits 94287082)
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(currentTotpCode(secret, new Date(59_000))).toBe("287082");
  });

  it("builds a provisioning URI and an SVG QR code", () => {
    const secret = generateTotpSecret();
    const uri = totpUri(secret, "kuromaru");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=Wire%20Pay");
    expect(uri).toContain(`secret=${secret}`);
    const svg = totpQrSvg(uri);
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
