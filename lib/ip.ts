// IPv4 / CIDR helpers used by the IP-restriction screens and the enforcement
// in app/layout.tsx / lib/api/handler.ts. Pure functions, no Node APIs, so
// they run on the client for inline validation too.

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Parse dotted-quad IPv4 into a 32-bit unsigned integer, or null. */
export function parseIpv4(s: string): number | null {
  const m = IPV4_RE.exec(s.trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet > 255 || (m[i].length > 1 && m[i].startsWith("0"))) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

export interface Cidr {
  /** Network address (host bits cleared). */
  network: number;
  prefix: number;
}

/** Parse "a.b.c.d" (treated as /32) or "a.b.c.d/nn". */
export function parseCidr(s: string): Cidr | null {
  const [ipPart, prefixPart, extra] = s.trim().split("/");
  if (extra !== undefined) return null;
  const ip = parseIpv4(ipPart ?? "");
  if (ip === null) return null;
  let prefix = 32;
  if (prefixPart !== undefined) {
    if (!/^\d{1,2}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix < 0 || prefix > 32) return null;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: (ip & mask) >>> 0, prefix };
}

export function isValidCidr(s: string): boolean {
  return parseCidr(s) !== null;
}

export function ipInCidr(ip: number, cidr: Cidr): boolean {
  const mask = cidr.prefix === 0 ? 0 : (0xffffffff << (32 - cidr.prefix)) >>> 0;
  return ((ip & mask) >>> 0) === cidr.network;
}

export function formatIpv4(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

/** Canonical form: host bits cleared, "/32" omitted. */
export function normalizeCidr(s: string): string | null {
  const c = parseCidr(s);
  if (!c) return null;
  return c.prefix === 32 ? formatIpv4(c.network) : `${formatIpv4(c.network)}/${c.prefix}`;
}

/** True when the IPv4 address `ip` falls inside `cidr` (either side may be malformed → false). */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const n = parseIpv4(unwrapMappedIpv6(ip));
  const c = parseCidr(cidr);
  return n !== null && c !== null && ipInCidr(n, c);
}

export interface IpRule {
  cidr: string;
  mode: "allow" | "deny";
}

export type AllowVerdict =
  | { kind: "blocked"; matched: string }
  | { kind: "allowed"; matched: string }
  | { kind: "denied" }
  | { kind: "no_rules" }
  | { kind: "unsupported" };

/**
 * Evaluate a caller against enabled rules. Deny rules win: a matching deny
 * rule blocks the caller regardless of allow rules. Allow rules are
 * informational: "allowed" when one matches, "denied" (not on the list) when
 * none does, "no_rules" when there are no allow rules at all. IPv6 (including
 * ::1) is reported as unsupported except for the IPv4-mapped form
 * ::ffff:a.b.c.d which is unwrapped.
 */
export function evaluateRules(clientIp: string, rules: readonly IpRule[]): AllowVerdict {
  const ip = parseIpv4(unwrapMappedIpv6(clientIp));
  if (ip === null) return { kind: "unsupported" };
  for (const r of rules) {
    if (r.mode !== "deny") continue;
    const c = parseCidr(r.cidr);
    if (c && ipInCidr(ip, c)) return { kind: "blocked", matched: r.cidr };
  }
  const allows = rules.filter((r) => r.mode === "allow");
  if (allows.length === 0) return { kind: "no_rules" };
  for (const r of allows) {
    const c = parseCidr(r.cidr);
    if (c && ipInCidr(ip, c)) return { kind: "allowed", matched: r.cidr };
  }
  return { kind: "denied" };
}

/** Allow-list only evaluation (kept for callers that have no deny rules). */
export function evaluateAllowList(clientIp: string, rules: readonly string[]): AllowVerdict {
  return evaluateRules(
    clientIp,
    rules.map((cidr) => ({ cidr, mode: "allow" as const })),
  );
}

/** Whether the caller is blocked by an enabled deny rule. */
export function isBlocked(clientIp: string, rules: readonly IpRule[]): boolean {
  return evaluateRules(clientIp, rules).kind === "blocked";
}

export function unwrapMappedIpv6(s: string): string {
  const t = s.trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(t);
  if (m) return m[1];
  if (t === "::1") return "127.0.0.1";
  return t;
}

/** First hop of X-Forwarded-For, else X-Real-IP, else null. */
export function clientIpFromHeaders(get: (name: string) => string | null): string | null {
  const xff = get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return get("x-real-ip")?.trim() || null;
}
