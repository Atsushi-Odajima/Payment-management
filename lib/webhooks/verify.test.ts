import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "./verify";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "payment.captured", data: { externalId: "x" } });

describe("webhook signatures", () => {
  it("accepts a valid signature within tolerance", () => {
    const header = signWebhookPayload(secret, 1_700_000_000, body);
    expect(verifyWebhookSignature(secret, header, body, { now: 1_700_000_100 })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const header = signWebhookPayload(secret, 1_700_000_000, body);
    expect(verifyWebhookSignature(secret, header, body + " ", { now: 1_700_000_000 })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects the wrong secret", () => {
    const header = signWebhookPayload("other", 1_700_000_000, body);
    expect(verifyWebhookSignature(secret, header, body, { now: 1_700_000_000 }).ok).toBe(false);
  });

  it("rejects stale timestamps (replay)", () => {
    const header = signWebhookPayload(secret, 1_700_000_000, body);
    expect(verifyWebhookSignature(secret, header, body, { now: 1_700_000_000 + 301 })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects malformed headers", () => {
    expect(verifyWebhookSignature(secret, null, body)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyWebhookSignature(secret, "t=abc,v1=zz", body)).toEqual({ ok: false, reason: "malformed" });
  });
});
