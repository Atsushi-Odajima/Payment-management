import { describe, expect, it } from "vitest";
import { buildNotificationSample, toCurl } from "./notification";

const base = { notifyUrl: "https://shop.example.jp/notify" };
const names = (cfg: Parameters<typeof buildNotificationSample>[0]) =>
  buildNotificationSample(cfg).params.map((p) => p.name);

describe("notification sample", () => {
  it("includes identifiers according to the id format", () => {
    expect(names({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" })).toEqual(
      expect.arrayContaining(["payment_id"]),
    );
    expect(names({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" })).not.toContain(
      "transaction_id",
    );
    expect(names({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "transaction_id" })).not.toContain(
      "payment_id",
    );
    expect(names({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "both" })).toEqual(
      expect.arrayContaining(["payment_id", "transaction_id"]),
    );
  });

  it("parameter sets are cumulative", () => {
    const minimal = names({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" });
    const standard = names({ ...base, notifyFormat: "json_post", notifyParamSet: "standard", notifyIdFormat: "payment_id" });
    const full = names({ ...base, notifyFormat: "json_post", notifyParamSet: "full", notifyIdFormat: "payment_id" });
    expect(minimal).toEqual(["payment_id", "event", "merchant_id", "amount", "currency", "paid_at", "status"]);
    expect(standard).toEqual([...minimal, "payment_method", "user_id", "product_id"]);
    expect(full).toEqual([...standard, "domain", "transaction_id"]);
  });

  it("does not duplicate transaction_id in full when the id format already has it", () => {
    const full = names({ ...base, notifyFormat: "json_post", notifyParamSet: "full", notifyIdFormat: "both" });
    expect(full.filter((n) => n === "transaction_id")).toHaveLength(1);
  });

  it("renders JSON POST with a numeric amount", () => {
    const s = buildNotificationSample({ ...base, notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" }, "MER-00007");
    expect(s.method).toBe("POST");
    expect(s.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(s.body!);
    expect(parsed.amount).toBe(4980);
    expect(parsed.merchant_id).toBe("MER-00007");
  });

  it("renders form-urlencoded POST", () => {
    const s = buildNotificationSample({ ...base, notifyFormat: "form_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" });
    expect(s.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(s.body).toContain("amount=4980");
    expect(s.body).toContain("paid_at=2026-09-01T12%3A34%3A56%2B09%3A00");
  });

  it("renders GET with a query string and no body", () => {
    const s = buildNotificationSample({ ...base, notifyFormat: "query_get", notifyParamSet: "standard", notifyIdFormat: "transaction_id" });
    expect(s.method).toBe("GET");
    expect(s.body).toBeNull();
    const u = new URL(s.url);
    expect(u.searchParams.get("transaction_id")).toBeTruthy();
    expect(u.searchParams.get("user_id")).toBe("user_10293");
    expect(u.searchParams.get("payment_id")).toBeNull();
  });

  it("always carries the signature header and falls back to a placeholder URL", () => {
    const s = buildNotificationSample({ notifyUrl: "", notifyFormat: "json_post", notifyParamSet: "minimal", notifyIdFormat: "payment_id" });
    expect(s.url).toMatch(/^https:\/\//);
    expect(s.headers["Wirepay-Signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(toCurl(s)).toContain("curl -X POST");
  });
});
