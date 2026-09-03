"use client";

import { useT } from "./language-provider";
import type { AdminStatus, Role } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  return <span className={cn("badge", role === "master" ? "bg-slate-800 text-white ring-slate-700" : "bg-slate-100 text-slate-700 ring-slate-200")}>{t(`role.${role}`)}</span>;
}

const STATUS_CLASS: Record<AdminStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  disabled: "bg-slate-200 text-slate-700 ring-slate-300",
  invited: "bg-amber-100 text-amber-800 ring-amber-200",
};

export function AdminStatusBadge({ status }: { status: AdminStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_CLASS[status])}>{t(`adminEnums.status.${status}`)}</span>;
}
