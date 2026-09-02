import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimiter } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to the limit then blocks within the window", () => {
    const opts = { limit: 3, windowMs: 60_000, now: 1_000 };
    expect(rateLimit("k", opts).ok).toBe(true);
    expect(rateLimit("k", opts).ok).toBe(true);
    expect(rateLimit("k", opts).ok).toBe(true);
    const blocked = rateLimit("k", opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });

  it("resets after the window and isolates keys", () => {
    rateLimit("a", { limit: 1, windowMs: 1_000, now: 0 });
    expect(rateLimit("a", { limit: 1, windowMs: 1_000, now: 500 }).ok).toBe(false);
    expect(rateLimit("b", { limit: 1, windowMs: 1_000, now: 500 }).ok).toBe(true);
    expect(rateLimit("a", { limit: 1, windowMs: 1_000, now: 1_001 }).ok).toBe(true);
  });
});
