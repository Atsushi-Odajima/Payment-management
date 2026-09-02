// Server-only enforcement of admin IP restrictions.
//
// Enabled "deny" rules for the admin target block the caller: app/layout.tsx
// renders the blocked screen instead of the page, and lib/api/handler.ts
// answers 403 on API routes (webhooks and the demo endpoints opt out — they
// are not admin traffic). Allow rules stay informational; enforcing an
// allow-list would lock operators out the moment they save a rule that does
// not cover their own address.
//
// The Edge middleware cannot query Prisma, which is why the check lives here.

import { prisma } from "@/lib/db";
import { clientIpFromHeaders, evaluateRules, type IpRule } from "@/lib/ip";

export interface AdminAccess {
  ip: string | null;
  blocked: boolean;
  /** The deny rule that matched, when blocked. */
  matched?: string;
}

/** Enabled admin rules (both modes) for evaluation / display. */
export async function loadAdminRules(): Promise<IpRule[]> {
  const rows = await prisma.ipRestriction.findMany({
    where: { target: "admin", enabled: true },
    orderBy: { createdAt: "asc" },
    select: { cidr: true, mode: true },
  });
  return rows.map((r) => ({ cidr: r.cidr, mode: r.mode === "deny" ? "deny" : "allow" }));
}

/** Evaluate the caller (from proxy headers) against enabled admin deny rules. */
export async function checkAdminAccess(getHeader: (name: string) => string | null): Promise<AdminAccess> {
  const ip = clientIpFromHeaders(getHeader);
  if (!ip) return { ip: null, blocked: false };
  const rules = await prisma.ipRestriction.findMany({
    where: { target: "admin", enabled: true, mode: "deny" },
    select: { cidr: true },
  });
  if (rules.length === 0) return { ip, blocked: false };
  const verdict = evaluateRules(
    ip,
    rules.map((r) => ({ cidr: r.cidr, mode: "deny" as const })),
  );
  return verdict.kind === "blocked" ? { ip, blocked: true, matched: verdict.matched } : { ip, blocked: false };
}
