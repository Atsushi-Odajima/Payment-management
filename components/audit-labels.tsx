"use client";

import { useT } from "./language-provider";
import type { MessageKey } from "@/lib/i18n";
import { isAuditAction, isAuditTargetType } from "@/lib/audit";

/** Localized label for an audit action ("merchant.update" → auditEnums.action.merchant_update). */
export function useAuditLabels() {
  const t = useT();
  return {
    action: (a: string) => (isAuditAction(a) ? t(`auditEnums.action.${a.replace(/\./g, "_")}` as MessageKey) : a),
    targetType: (x: string) => (isAuditTargetType(x) ? t(`auditEnums.targetType.${x}` as MessageKey) : x),
    actorType: (x: string) => t(`auditEnums.actorType.${x}` as MessageKey),
  };
}
