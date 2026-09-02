import { ApiError } from "@/lib/api/handler";
import { clientIpFromHeaders, ipMatchesCidr } from "@/lib/ip";
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
