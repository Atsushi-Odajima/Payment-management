import { describe, expect, it } from "vitest";
import { formatDateTime, langFromRequest, resolveInitialLang, translate, type MessageKey } from "./index";
import { ja } from "./messages/ja";
import { en } from "./messages/en";

type Node = string | { [k: string]: Node };

function leaves(obj: Node, prefix = ""): Array<[string, string]> {
  if (typeof obj === "string") return [[prefix, obj]];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const JP = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

describe("translate", () => {
  it("interpolates {placeholders}", () => {
    expect(translate("ja", "dashboard.valueCount", { count: 3 })).toBe("3 件");
    expect(translate("en", "payments.statTodaySalesSub", { count: 2 })).toBe("2 payments");
  });

  it("returns the key for unknown paths", () => {
    expect(translate("en", "nav.doesNotExist" as MessageKey)).toBe("nav.doesNotExist");
  });

  it("uses identical placeholder sets in both catalogs", () => {
    const jaLeaves = new Map(leaves(ja as unknown as Node));
    for (const [key, enText] of leaves(en as unknown as Node)) {
      expect(params(enText), key).toEqual(params(jaLeaves.get(key) ?? ""));
    }
  });

  it("has no Japanese characters in the English catalog", () => {
    for (const [key, text] of leaves(en as unknown as Node)) {
      expect(JP.test(text), `${key}: ${text}`).toBe(false);
    }
  });
});

describe("language resolution", () => {
  it("falls back to ja for missing/invalid x-lang", () => {
    expect(langFromRequest(new Request("http://x/"))).toBe("ja");
    expect(langFromRequest(new Request("http://x/", { headers: { "x-lang": "fr" } }))).toBe("ja");
    expect(langFromRequest(new Request("http://x/", { headers: { "x-lang": "en" } }))).toBe("en");
  });

  it("prefers the cookie, then Accept-Language, then ja", () => {
    expect(resolveInitialLang("en", "ja-JP")).toBe("en");
    expect(resolveInitialLang(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(resolveInitialLang(undefined, "ja,en;q=0.8")).toBe("ja");
    expect(resolveInitialLang(undefined, null)).toBe("ja");
  });
});

describe("formatDateTime", () => {
  const d = new Date("2026-09-01T03:04:00Z"); // 12:04 JST
  it("renders in Asia/Tokyo for both languages", () => {
    expect(formatDateTime(d, "ja")).toBe("2026/09/01 12:04");
    expect(formatDateTime(d, "en")).toBe("Sep 1, 2026, 12:04 PM");
  });
});
