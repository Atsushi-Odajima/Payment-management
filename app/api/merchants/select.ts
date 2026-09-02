// Columns safe to send to the client. passwordEnc is deliberately absent.
export const MERCHANT_SELECT = {
  id: true,
  merchantCode: true,
  siteName: true,
  siteNameKana: true,
  companyName: true,
  contactName: true,
  email: true,
  statementEmail: true,
  notifyUrl: true,
  notifyFormat: true,
  notifyParamSet: true,
  notifyIdFormat: true,
  emailNotification: true,
  agentId: true,
  enabledMethods: true,
  agent: { select: { id: true, agentCode: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

import { parseEnabledMethods } from "@/lib/merchants/types";

/** Shape a selected row for the client: enabledMethods JSON → string[]. */
export function serialize<T extends { enabledMethods: string }>(row: T): Omit<T, "enabledMethods"> & { enabledMethods: string[] } {
  const { enabledMethods, ...rest } = row;
  return { ...rest, enabledMethods: parseEnabledMethods(enabledMethods) };
}
