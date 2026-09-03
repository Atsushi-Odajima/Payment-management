"use client";

import { useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import type { SubscriptionStatus } from "@/lib/subscriptions/types";
import type { PaymentLinkStatus } from "@/lib/payment-links/types";
import { cn } from "@/lib/utils";

const SUB_CLASS: Record<SubscriptionStatus, string> = {
  trialing: "bg-sky-100 text-sky-800 ring-sky-200",
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  past_due: "bg-amber-100 text-amber-800 ring-amber-200",
  suspended: "bg-rose-100 text-rose-800 ring-rose-200",
  cancelled: "bg-slate-200 text-slate-600 ring-slate-300",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const t = useT();
  return <span className={cn("badge", SUB_CLASS[status])}>{t(`subscriptionEnums.status.${status}` as MessageKey)}</span>;
}

export function PaymentLinkStatusBadge({ status, unavailable }: { status: PaymentLinkStatus; unavailable: string | null }) {
  const t = useT();
  const key = unavailable ?? (status === "active" ? "active" : "disabled");
  const cls = key === "active" ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : key === "disabled" ? "bg-slate-200 text-slate-600 ring-slate-300" : "bg-amber-100 text-amber-800 ring-amber-200";
  return <span className={cn("badge", cls)}>{t(`paymentLinkEnums.state.${key}` as MessageKey)}</span>;
}
