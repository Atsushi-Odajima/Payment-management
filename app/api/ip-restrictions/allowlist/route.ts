import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { clientIpFromHeaders, evaluateRules } from "@/lib/ip";
import { IP_TARGETS } from "@/lib/ip-restrictions/types";
import { allowlistStatus } from "@/lib/ip-restrictions/allowlist";
import { loadGlobalSettings, saveGlobalSettings } from "@/lib/settings/global";

const Body = z.object({ target: z.enum(IP_TARGETS), enabled: z.boolean() });

export const GET = withApiHandler(async () => ok(await allowlistStatus()));

/**
 * PUT /api/ip-restrictions/allowlist { target, enabled } — switch the
 * allow-list mode of a target (Phase P4-1, permission ip_restriction.update).
 * Turning it on needs at least one enabled allow rule for the target, and for
 * the admin target the operator's own address must be on the list
 * (ip_self_block) — otherwise the very next request would be refused.
 */
export const PUT = withApiHandler(async (req) => {
  await requirePermission(req, "ip_restriction", "update");
  const body = Body.parse(await readJson(req));
  const settings = await loadGlobalSettings(prisma);
  if (body.enabled) {
    const allows = await prisma.ipRestriction.findMany({ where: { target: body.target, mode: "allow", enabled: true }, select: { cidr: true } });
    if (allows.length === 0) throw new ApiError(400, "allowlist_no_rules", "errors.allowlistNoRules");
    if (body.target === "admin") {
      const ip = clientIpFromHeaders((n) => req.headers.get(n));
      const verdict = ip ? evaluateRules(ip, allows.map((a) => ({ cidr: a.cidr, mode: "allow" as const }))) : null;
      if (!verdict || verdict.kind !== "allowed") {
        throw new ApiError(400, "ip_self_block", "errors.ipSelfBlockAllowlist", { ip: ip ?? "" });
      }
    }
  }
  const next = { ...settings, ...(body.target === "admin" ? { ipAllowlistAdmin: body.enabled } : { ipAllowlistMerchantApi: body.enabled }) };
  await saveGlobalSettings(prisma, next, await auditContextFromRequest(req));
  return ok(await allowlistStatus());
});
