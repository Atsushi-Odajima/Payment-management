import { describe, expect, it, vi } from "vitest";
import {
  cookieFromHeader,
  createSessionToken,
  createTwoFactorToken,
  sessionFromCookieHeader,
  timingSafeEqualBytes,
  verifySessionToken,
  verifyTwoFactorToken,
} from "./auth";

const USER = { id: "adm_1", role: "master" as const };

describe("session tokens", () => {
  it("verifies a freshly created token and returns its payload", async () => {
    const token = await createSessionToken(USER, 1_000_000);
    const p = await verifySessionToken(token, 1_000_000 + 60);
    expect(p).toMatchObject({ sub: "adm_1", role: "master", purpose: "session" });
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(USER, 1_000_000);
    expect(await verifySessionToken(token, 1_000_000 + 13 * 3600)).toBeNull();
  });

  it("rejects tampered or garbage tokens", async () => {
    const token = await createSessionToken(USER);
    const [body, sig] = token.split(".");
    expect(await verifySessionToken(`${body}x.${sig}`)).toBeNull();
    expect(await verifySessionToken(`${body}.${sig.slice(1)}`)).toBeNull();
    expect(await verifySessionToken("nope")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(USER);
    vi.stubEnv("SESSION_SECRET", "another-secret");
    expect(await verifySessionToken(token)).toBeNull();
    vi.unstubAllEnvs();
  });

  it("never accepts a two-factor token as a session (and vice versa)", async () => {
    const pending = await createTwoFactorToken(USER, 1_000_000);
    expect(await verifySessionToken(pending, 1_000_000 + 10)).toBeNull();
    expect((await verifyTwoFactorToken(pending, 1_000_000 + 10))?.sub).toBe("adm_1");
    expect(await verifyTwoFactorToken(pending, 1_000_000 + 600)).toBeNull(); // 5 minutes
    const session = await createSessionToken(USER);
    expect(await verifyTwoFactorToken(session)).toBeNull();
  });

  it("compares bytes in constant time", () => {
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
    expect(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });
});

describe("cookie parsing", () => {
  it("extracts cookies by name", () => {
    expect(sessionFromCookieHeader("a=1; wirepay.session=abc.def; b=2")).toBe("abc.def");
    expect(cookieFromHeader("wirepay.2fa=x.y; other=1", "wirepay.2fa")).toBe("x.y");
    expect(sessionFromCookieHeader(null)).toBe(null);
  });
});
