"use client";

import { useT } from "./language-provider";
import { PAYMENT_STATUS_COLOR, cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/payments/transitions";

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  const t = useT();
  return (
    <span className={cn("badge", PAYMENT_STATUS_COLOR[status], className)}>
      {t(`status.${status}`)}
    </span>
  );
}

export function ModeBadge({ live }: { live: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        "badge",
        live
          ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
          : "bg-amber-100 text-amber-800 ring-amber-200",
      )}
    >
      {live ? t("common.live") : t("common.test")}
    </span>
  );
}

export function ProviderStatusBadge({ active }: { active: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        "badge",
        active
          ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
          : "bg-slate-200 text-slate-700 ring-slate-300",
      )}
    >
      {active ? t("common.enabled") : t("common.disabled")}
    </span>
  );
}
