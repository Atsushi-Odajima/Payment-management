"use client";

import { useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import type { SettlementStatus } from "@/lib/settlements/types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<SettlementStatus, string> = {
  collecting: "bg-slate-100 text-slate-700 ring-slate-200",
  confirmed: "bg-sky-100 text-sky-800 ring-sky-200",
  scheduled: "bg-amber-100 text-amber-800 ring-amber-200",
  paid: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  held: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status])}>{t(`settlementEnums.status.${status}` as MessageKey)}</span>;
}
