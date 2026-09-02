"use client";

import { useRouter } from "next/navigation";
import { useRole } from "./role-provider";
import { useT } from "./language-provider";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/merchants/types";

/** Header control: switch the demo operator role (master / general). */
export function RoleToggle() {
  const { role, setRole } = useRole();
  const t = useT();
  const router = useRouter();

  function choose(next: Role) {
    if (next === role) return;
    setRole(next);
    // Server components read the cookie; refresh so SSR output matches.
    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label={t("role.label")}
      className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-xs font-medium"
    >
      <button
        type="button"
        onClick={() => choose("master")}
        aria-pressed={role === "master"}
        title={t("role.masterHint")}
        className={cn(
          "px-3 py-1.5 transition",
          role === "master" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {t("role.master")}
      </button>
      <button
        type="button"
        onClick={() => choose("general")}
        aria-pressed={role === "general"}
        title={t("role.generalHint")}
        className={cn(
          "px-3 py-1.5 transition",
          role === "general" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        {t("role.general")}
      </button>
    </div>
  );
}
