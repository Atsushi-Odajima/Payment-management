import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { clientIpFromHeaders, evaluateRules, ipMatchesCidr } from "@/lib/ip";
import { loadGlobalSettings } from "@/lib/settings/global";
import type { IpRestrictionInput } from "./types";

/**
 * Refuse an enabled admin deny rule that matches the caller's own address —
 * saving it would lock the operator out of the dashboard immediately.
 */
export function assertNotSelfBlock(req: Request, rule: IpRestrictionInput): void {
  if (rule.target !== "admin" || rule.mode !== "deny" || !rule.enabled) return;
  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  if (ip && ipMatchesCidr(ip, rule.cidr)) {
    throw new ApiError(400, "ip_self_block", "errors.ipSelfBlock", { ip }, { fieldErrors: { cidr: "selfBlock" } });
  }
}

/**
 * Allow-list mode guard (Phase P4-1): while the admin allow-list mode is on,
 * a change to the admin allow rules (edit / disable / delete) must leave the
 * operator's own address covered by at least one enabled allow rule —
 * otherwise the change would lock them out at once. Zero remaining allow
 * rules is fine (the mode then enforces nothing).
 */
export async function assertAllowlistKeepsSelf(db: PrismaClient, req: Request, change: { excludeId?: string; replacement?: IpRestrictionInput | null }): Promise<void> {
  const settings = await loadGlobalSettings(db);
  if (!settings.ipAllowlistAdmin) return;
  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  if (!ip) return;
  const rows = await db.ipRestriction.findMany({ where: { target: "admin", enabled: true, mode: "allow", ...(change.excludeId ? { id: { not: change.excludeId } } : {}) }, select: { cidr: true } });
  const allows = rows.map((r) => ({ cidr: r.cidr, mode: "allow" as const }));
  const r = change.replacement;
  if (r && r.target === "admin" && r.mode === "allow" && r.enabled) allows.push({ cidr: r.cidr, mode: "allow" as const });
  if (allows.length === 0) return;
  if (evaluateRules(ip, allows).kind === "denied") {
    throw new ApiError(400, "ip_self_block", "errors.ipSelfBlockAllowlist", { ip }, { fieldErrors: { cidr: "selfBlock" } });
  }
}
