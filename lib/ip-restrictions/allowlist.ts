// Allow-list mode status (Phase P4-1): the per-target flags from the global
// settings plus how many enabled allow rules each target has — what the IP
// restrictions screen and GET /api/ip-restrictions/allowlist show.

import { prisma } from "@/lib/db";
import type { IpTarget } from "./types";
import { loadGlobalSettings } from "@/lib/settings/global";

export type AllowlistStatus = Record<IpTarget, { enabled: boolean; allowRules: number }>;

export async function allowlistStatus(): Promise<AllowlistStatus> {
  const [settings, adminAllow, merchantAllow] = await Promise.all([
    loadGlobalSettings(prisma),
    prisma.ipRestriction.count({ where: { target: "admin", mode: "allow", enabled: true } }),
    prisma.ipRestriction.count({ where: { target: "merchant_api", mode: "allow", enabled: true } }),
  ]);
  return { admin: { enabled: settings.ipAllowlistAdmin, allowRules: adminAllow }, merchant_api: { enabled: settings.ipAllowlistMerchantApi, allowRules: merchantAllow } };
}
