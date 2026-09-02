import { describe, expect, it } from "vitest";
import { runConnectionTest } from "./connection";

describe("runConnectionTest", () => {
  it("reports missing required fields with localized labels", () => {
    const ja = runConnectionTest("gmo_pg", { site_id: "s" }, true, "ja");
    expect(ja.ok).toBe(false);
    expect(ja.message).toContain("サイトパスワード");
    const en = runConnectionTest("gmo_pg", { site_id: "s" }, true, "en");
    expect(en.ok).toBe(false);
    expect(en.message).toContain("Site password");
  });

  it("rejects non-URL values in url fields", () => {
    const r = runConnectionTest(
      "gmo_pg",
      { site_id: "s", site_password: "p", shop_id: "x", shop_password: "y", api_endpoint: "not a url" },
      false,
      "en",
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/API endpoint must be a valid URL/);
  });

  it("succeeds with all required fields, naming the provider and mode", () => {
    const r = runConnectionTest("paypay", { merchant_id: "m", api_key: "k", api_secret: "s" }, true, "ja");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("PayPay");
    expect(r.message).toContain("テストモード");
  });

  it("rejects unknown providers", () => {
    expect(runConnectionTest("nope", {}, true, "en")).toEqual({ ok: false, message: "Unsupported provider" });
  });
});
