import { describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isAuthConfigured,
  sessionFromCookieHeader,
  timingSafeEqualBytes,
  verifyPassword,
  verifySessionToken,
} from "./auth";

describe("session tokens", () => {
  it("verifies a freshly created token", async () => {
    const token = await createSessionToken(1_000_000);
    expect(await verifySessionToken(token, 1_000_000 + 60)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(1_000_000);
    expect(await verifySessionToken(token, 1_000_000 + 13 * 3600)).toBe(false);
  });

  it("rejects tampered or garbage tokens", async () => {
    const token = await createSessionToken();
    const [body, sig] = token.split(".");
    expect(await verifySessionToken(`${body}x.${sig}`)).toBe(false);
    expect(await verifySessionToken(`${body}.${sig.slice(1)}`)).toBe(false);
    expect(await verifySessionToken("nope")).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken();
    vi.stubEnv("SESSION_SECRET", "another-secret");
    expect(await verifySessionToken(token)).toBe(false);
  });
});

describe("password", () => {
  it("is disabled when ADMIN_PASSWORD is unset", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(isAuthConfigured()).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("compares in constant time", () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    expect(isAuthConfigured()).toBe(true);
    expect(verifyPassword("correct horse")).toBe(true);
    expect(verifyPassword("correct horsE")).toBe(false);
    expect(verifyPassword("short")).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("cookie parsing", () => {
  it("extracts the session cookie", () => {
    expect(sessionFromCookieHeader("a=1; wirepay.session=abc.def; b=2")).toBe("abc.def");
    expect(sessionFromCookieHeader(null)).toBe(null);
  });
});
