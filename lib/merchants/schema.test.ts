import { describe, expect, it } from "vitest";
import { EMPTY_MERCHANT_INPUT, KATAKANA_RE, validateMerchantInput } from "./schema";
import { formatMerchantCode, parseMerchantCode } from "./types";

const valid = {
  ...EMPTY_MERCHANT_INPUT,
  siteName: "Kotori Shop",
  siteNameKana: "コトリ ショップ",
  companyName: "Kotori Inc.",
  contactName: "Yu Kotori",
  email: "info@kotori.example.jp",
  statementEmail: "billing@kotori.example.jp",
  notifyUrl: "https://kotori.example.jp/wirepay/notify",
};

describe("merchant validation", () => {
  it("accepts a valid input", () => {
    expect(validateMerchantInput(valid)).toEqual({ ok: true, data: valid });
  });

  it("katakana: full-width katakana only", () => {
    expect(KATAKANA_RE.test("カタカナー")).toBe(true);
    expect(KATAKANA_RE.test("ひらがな")).toBe(false); // hiragana
    expect(KATAKANA_RE.test("ｶﾀｶﾅ")).toBe(false); // half-width
    expect(KATAKANA_RE.test("Kana")).toBe(false);
    const r = validateMerchantInput({ ...valid, siteNameKana: "ひらがな" });
    expect(r).toEqual({ ok: false, errors: { siteNameKana: "katakana" } });
  });

  it("emails must be well-formed", () => {
    const r = validateMerchantInput({ ...valid, email: "not-an-email", statementEmail: "x@" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ email: "email", statementEmail: "email" });
  });

  it("notification URL must be https", () => {
    const r = validateMerchantInput({ ...valid, notifyUrl: "http://kotori.example.jp/notify" });
    expect(r).toEqual({ ok: false, errors: { notifyUrl: "https" } });
  });

  it("reports required fields (first error per field)", () => {
    const r = validateMerchantInput({ ...valid, siteName: "  ", contactName: "" });
    expect(r).toEqual({ ok: false, errors: { siteName: "required", contactName: "required" } });
  });

  it("rejects unknown enum values", () => {
    const r = validateMerchantInput({ ...valid, notifyFormat: "xml" });
    expect(r).toEqual({ ok: false, errors: { notifyFormat: "invalid" } });
  });
});

describe("merchant codes", () => {
  it("formats and parses MER-00001 style codes", () => {
    expect(formatMerchantCode(1)).toBe("MER-00001");
    expect(formatMerchantCode(123456)).toBe("MER-123456");
    expect(parseMerchantCode("MER-00042")).toBe(42);
    expect(parseMerchantCode("MER-42")).toBeNull();
    expect(parseMerchantCode("X-00001")).toBeNull();
  });
});
