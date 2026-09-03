"use client";

import { useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import type { ChargebackStatus } from "@/lib/chargebacks/types";
import type { BlacklistStatus } from "@/lib/risk/types";
import type { DepositDiffStatus } from "@/lib/risk/deposit-diff-types";
import { cn } from "@/lib/utils";

const CB_CLASS: Record<ChargebackStatus, string> = {
  received: "bg-amber-100 text-amber-800 ring-amber-200",
  disputed: "bg-sky-100 text-sky-800 ring-sky-200",
  won: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  lost: "bg-rose-100 text-rose-800 ring-rose-200",
  confirmed: "bg-rose-600 text-white ring-rose-700",
};

export function ChargebackStatusBadge({ status }: { status: ChargebackStatus }) {
  const t = useT();
  return <span className={cn("badge", CB_CLASS[status])}>{t(`chargebackEnums.status.${status}` as MessageKey)}</span>;
}

const BL_CLASS: Record<BlacklistStatus, string> = {
  candidate: "bg-amber-100 text-amber-800 ring-amber-200",
  active: "bg-rose-100 text-rose-800 ring-rose-200",
  disabled: "bg-slate-100 text-slate-700 ring-slate-200",
  rejected: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function BlacklistStatusBadge({ status }: { status: BlacklistStatus }) {
  const t = useT();
  return <span className={cn("badge", BL_CLASS[status])}>{t(`blacklistEnums.status.${status}` as MessageKey)}</span>;
}

const DD_CLASS: Record<DepositDiffStatus, string> = {
  open: "bg-rose-100 text-rose-800 ring-rose-200",
  refund_arranged: "bg-sky-100 text-sky-800 ring-sky-200",
  notified: "bg-amber-100 text-amber-800 ring-amber-200",
  resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export function DepositDiffStatusBadge({ status }: { status: DepositDiffStatus }) {
  const t = useT();
  return <span className={cn("badge", DD_CLASS[status])}>{t(`depositDiffEnums.status.${status}` as MessageKey)}</span>;
}
