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
  transferIdDigits: true,
  agent: { select: { id: true, agentCode: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

import { parseEnabledMethods, type MerchantInput } from "@/lib/merchants/types";
import { DEFAULT_TRANSFER_ID_DIGITS, isTransferIdDigits, type TransferIdDigits } from "@/lib/payments/transfer";
import type { PaymentMethod } from "@/lib/payments/methods";

/** Shape a selected row for the client: enabledMethods JSON → array, digits narrowed. */
export function serialize<T extends { enabledMethods: string; transferIdDigits: number }>(
  row: T,
): Omit<T, "enabledMethods" | "transferIdDigits"> & { enabledMethods: PaymentMethod[]; transferIdDigits: TransferIdDigits } {
  const { enabledMethods, transferIdDigits, ...rest } = row;
  return {
    ...rest,
    enabledMethods: parseEnabledMethods(enabledMethods),
    transferIdDigits: isTransferIdDigits(transferIdDigits) ? transferIdDigits : DEFAULT_TRANSFER_ID_DIGITS,
  };
}

/** Validated input → Prisma data (enabledMethods stored as JSON). */
export function toMerchantData(input: MerchantInput) {
  return { ...input, enabledMethods: JSON.stringify(input.enabledMethods) };
}
