import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  evaluateAllowList,
  formatIpv4,
  ipInCidr,
  isValidCidr,
  normalizeCidr,
  parseCidr,
  parseIpv4,
  unwrapMappedIpv6,
} from "./ip";

describe("IPv4 / CIDR parsing", () => {
  it("parses dotted quads and rejects junk", () => {
    expect(parseIpv4("203.0.113.10")).toBe((203 << 24 | 0 << 16 | 113 << 8 | 10) >>> 0);
    expect(parseIpv4("256.0.0.1")).toBeNull();
    expect(parseIpv4("01.2.3.4")).toBeNull(); // leading zero
    expect(parseIpv4("1.2.3")).toBeNull();
    expect(parseIpv4("a.b.c.d")).toBeNull();
    expect(formatIpv4(parseIpv4("10.20.30.40")!)).toBe("10.20.30.40");
  });

  it("parses CIDR and treats a bare address as /32", () => {
    expect(parseCidr("198.51.100.0/24")).toEqual({ network: parseIpv4("198.51.100.0"), prefix: 24 });
    expect(parseCidr("198.51.100.77/24")?.network).toBe(parseIpv4("198.51.100.0")); // host bits cleared
    expect(parseCidr("203.0.113.10")).toEqual({ network: parseIpv4("203.0.113.10"), prefix: 32 });
    expect(parseCidr("0.0.0.0/0")).toEqual({ network: 0, prefix: 0 });
    expect(isValidCidr("10.0.0.0/33")).toBe(false);
    expect(isValidCidr("10.0.0.0/8/1")).toBe(false);
    expect(isValidCidr("10.0.0.0/-1")).toBe(false);
  });

  it("normalizes to canonical form", () => {
    expect(normalizeCidr("198.51.100.77/24")).toBe("198.51.100.0/24");
    expect(normalizeCidr("203.0.113.10/32")).toBe("203.0.113.10");
    expect(normalizeCidr("nope")).toBeNull();
  });

  it("matches addresses against a CIDR", () => {
    const c = parseCidr("192.0.2.0/28")!;
    expect(ipInCidr(parseIpv4("192.0.2.15")!, c)).toBe(true);
    expect(ipInCidr(parseIpv4("192.0.2.16")!, c)).toBe(false);
    expect(ipInCidr(parseIpv4("8.8.8.8")!, parseCidr("0.0.0.0/0")!)).toBe(true);
  });
});

describe("allow-list evaluation", () => {
  const rules = ["203.0.113.10", "198.51.100.0/24"];
  it("allows, denies, and reports the matched rule", () => {
    expect(evaluateAllowList("203.0.113.10", rules)).toEqual({ kind: "allowed", matched: "203.0.113.10" });
    expect(evaluateAllowList("198.51.100.200", rules)).toEqual({ kind: "allowed", matched: "198.51.100.0/24" });
    expect(evaluateAllowList("192.0.2.1", rules)).toEqual({ kind: "denied" });
  });
  it("handles no rules, IPv6 and mapped IPv4", () => {
    expect(evaluateAllowList("203.0.113.10", [])).toEqual({ kind: "no_rules" });
    expect(evaluateAllowList("2001:db8::1", rules)).toEqual({ kind: "unsupported" });
    expect(evaluateAllowList("::ffff:203.0.113.10", rules).kind).toBe("allowed");
    expect(unwrapMappedIpv6("::1")).toBe("127.0.0.1");
  });
  it("reads the client IP from proxy headers", () => {
    const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }))).toBe("203.0.113.10");
    expect(clientIpFromHeaders(h({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    expect(clientIpFromHeaders(h({}))).toBeNull();
  });
});
