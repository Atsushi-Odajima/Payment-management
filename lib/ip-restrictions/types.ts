export const IP_TARGETS = ["admin", "merchant_api"] as const;
export type IpTarget = (typeof IP_TARGETS)[number];

export function isIpTarget(v: unknown): v is IpTarget {
  return typeof v === "string" && (IP_TARGETS as readonly string[]).includes(v);
}

/**
 * deny: matching callers are blocked (enforced for the admin target).
 * allow: informational allow-list entry shown in the verdict.
 */
export const IP_MODES = ["deny", "allow"] as const;
export type IpMode = (typeof IP_MODES)[number];

export function isIpMode(v: unknown): v is IpMode {
  return typeof v === "string" && (IP_MODES as readonly string[]).includes(v);
}

export interface IpRestrictionInput {
  target: IpTarget;
  /** Required when target is merchant_api, must be null otherwise. */
  merchantId: string | null;
  cidr: string;
  label: string;
  mode: IpMode;
  enabled: boolean;
}

export interface IpRestrictionView extends IpRestrictionInput {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
