"use client";

import Link from "next/link";
import { useT } from "./language-provider";
import { MODE_FILTERS, cn, type ModeFilter } from "@/lib/utils";

/** Test / live / all chips. Builds links that preserve the other query params. */
export function ModeFilterChips({
  basePath,
  current,
  params,
}: {
  basePath: string;
  current: ModeFilter;
  params?: Record<string, string | undefined>;
}) {
  const t = useT();
  const href = (mode: ModeFilter) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    if (mode !== "all") q.set("mode", mode);
    else q.delete("mode");
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const label = (mode: ModeFilter) =>
    mode === "all" ? t("common.modeAll") : mode === "test" ? t("common.test") : t("common.live");
  return (
    <div
      role="group"
      aria-label={t("common.modeFilter")}
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
    >
      {MODE_FILTERS.map((m) => (
        <Link
          key={m}
          href={href(m)}
          aria-current={current === m ? "true" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            current === m ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {label(m)}
        </Link>
      ))}
    </div>
  );
}
