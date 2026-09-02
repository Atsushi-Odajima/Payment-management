export const IP_TARGETS = ["admin", "merchant_api"] as const;
export type IpTarget = (typeof IP_TARGETS)[number];

export function isIpTarget(v: unknown): v is IpTarget {
  return typeof v === "string" && (IP_TARGETS as readonly string[]).includes(v);
}

export interface IpRestrictionInput {
  target: IpTarget;
  /** Required when target is merchant_api, must be null otherwise. */
  merchantId: string | null;
  cidr: string;
  label: string;
  enabled: boolean;
}

export interface IpRestrictionView extends IpRestrictionInput {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
