import { describe, expect, it } from "vitest";
import { DEFAULT_MODE, MODE_COOKIE, livemodeWhere, modeFromCookieStore, resolveMode } from "./mode";

describe("test / live data mode", () => {
  it("defaults to test and only accepts the two known values", () => {
    expect(resolveMode(undefined)).toBe(DEFAULT_MODE);
    expect(resolveMode("live")).toBe("live");
    expect(resolveMode("test")).toBe("test");
    expect(resolveMode("production")).toBe("test");
  });

  it("reads the cookie store", () => {
    const store = (v?: string) => ({ get: (name: string) => (name === MODE_COOKIE && v ? { value: v } : undefined) });
    expect(modeFromCookieStore(store("live"))).toBe("live");
    expect(modeFromCookieStore(store())).toBe("test");
  });

  it("maps to the livemode column", () => {
    expect(livemodeWhere("live")).toEqual({ livemode: true });
    expect(livemodeWhere("test")).toEqual({ livemode: false });
  });
});
