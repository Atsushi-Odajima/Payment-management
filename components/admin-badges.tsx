"use client";

import { describeRole } from "@/lib/role";
import type { MessageKey } from "@/lib/i18n";

import { useT } from "./language-provider";
import type { AdminStatus, Role } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  return <span className={cn("badge", role === "admin" ? "bg-slate-800 text-white ring-slate-700" : "bg-slate-100 text-slate-700 ring-slate-200")}>{t(`role.${role}`)}</span>;
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

/** Every resource / action the role may perform (from the lib/role.ts matrix). */
export function RoleCapabilities({ role }: { role: Role }) {
  const t = useT();
  return (
    <ul className="grid gap-1 text-xs sm:grid-cols-2">
      {describeRole(role).map((r) => (
        <li key={r.resource}>
          <span className="font-medium text-slate-800">{t(`permissions.resource.${r.resource}` as MessageKey)}</span>
          <span className="text-slate-500">: {r.actions.map((a) => t(`permissions.action.${a}` as MessageKey)).join(" / ")}</span>
        </li>
      ))}
    </ul>
  );
}
