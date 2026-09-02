"use client";

import { useT } from "./language-provider";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/applications/types";

const CLASS: Record<ApplicationStatus, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
  returned: "bg-slate-200 text-slate-700 ring-slate-300",
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const t = useT();
  return <span className={cn("badge", CLASS[status])}>{t(`applicationEnums.status.${status}`)}</span>;
}
