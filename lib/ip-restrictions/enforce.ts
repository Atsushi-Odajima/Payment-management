// Server-only enforcement of admin IP restrictions.
//
// Enabled "deny" rules for the admin target always block the caller:
// app/layout.tsx renders the blocked screen instead of the page, and
// lib/api/handler.ts answers 403 on API routes (webhooks and the demo
// endpoints opt out — they are not admin traffic). Allow rules are
// informational unless the allow-list mode for the target is switched on
// (GlobalSetting.ipAllowlistAdmin, Phase P4-1): then a caller that matches
// none of the enabled allow rules is blocked as well (reason
// not_in_allowlist). With no enabled allow rule the mode enforces nothing,
// and it cannot be turned on unless the operator's own address is covered.
//
// The Edge middleware cannot query Prisma, which is why the check lives here.

import { prisma } from "@/lib/db";
import { clientIpFromHeaders, evaluateRules, type IpRule } from "@/lib/ip";
import { loadGlobalSettings } from "@/lib/settings/global";

export type BlockReason = "deny" | "not_in_allowlist";

export interface AdminAccess {
  ip: string | null;
  blocked: boolean;
  /** The deny rule that matched, when blocked by one. */
  matched?: string;
  reason?: BlockReason;
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

/** Evaluate the caller (from proxy headers) against enabled admin rules and the allow-list mode. */
export async function checkAdminAccess(getHeader: (name: string) => string | null): Promise<AdminAccess> {
  const ip = clientIpFromHeaders(getHeader);
  if (!ip) return { ip: null, blocked: false };
  const rules = await loadAdminRules();
  if (rules.length === 0) return { ip, blocked: false };
  const verdict = evaluateRules(ip, rules);
  if (verdict.kind === "blocked") return { ip, blocked: true, matched: verdict.matched, reason: "deny" };
  if (verdict.kind === "denied") {
    const settings = await loadGlobalSettings(prisma);
    if (settings.ipAllowlistAdmin) return { ip, blocked: true, reason: "not_in_allowlist" };
  }
  return { ip, blocked: false };
}
