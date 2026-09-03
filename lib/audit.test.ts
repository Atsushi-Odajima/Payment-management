import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, isAuditAction, redactForAudit } from "./audit";

describe("audit redaction", () => {
  it("masks secrets, serializes dates and keeps other values", () => {
    const out = redactForAudit({
      siteName: "Shop",
      passwordEnc: "abc",
      passwordHash: "scrypt$…",
      credentials: "{}",
      totpSecretEnc: null,
      nested: { webhook_secret: "x", amount: 5 },
      createdAt: new Date("2026-09-01T00:00:00Z"),
      list: [new Date("2026-09-02T00:00:00Z")],
    }) as Record<string, unknown>;
    expect(out).toEqual({
      siteName: "Shop",
      passwordEnc: "[redacted]",
      passwordHash: "[redacted]",
      credentials: "[redacted]",
      nested: { webhook_secret: "[redacted]", amount: 5 },
      createdAt: "2026-09-01T00:00:00.000Z",
      list: ["2026-09-02T00:00:00.000Z"],
    });
  });

  it("knows every payment action", () => {
    for (const a of ["capture", "cancel", "refund", "fail", "expire", "deposit"]) expect(isAuditAction(`payment.${a}`)).toBe(true);
    expect(isAuditAction("payment.bogus")).toBe(false);
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});
