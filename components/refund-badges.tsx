"use client";

import { useT } from "@/components/language-provider";
import type { MessageKey } from "@/lib/i18n";
import type { RefundStatus } from "@/lib/refunds/types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<RefundStatus, string> = {
  requested: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-sky-100 text-sky-800 ring-sky-200",
  processing: "bg-sky-100 text-sky-800 ring-sky-200",
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-slate-100 text-slate-700 ring-slate-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
};

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status])}>{t(`refundEnums.status.${status}` as MessageKey)}</span>;
}
