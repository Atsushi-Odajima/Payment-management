"use client";

import { useT } from "@/components/language-provider";

/** Route-level loading state: header + card skeletons. */
export default function Loading() {
  const t = useT();
  return (
    <div role="status" aria-live="polite" aria-label={t("pages.loading")} className="animate-pulse">
      <div className="mb-8 space-y-3">
        <div className="h-7 w-64 rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 bg-white" />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card h-64 lg:col-span-2" />
        <div className="card h-64" />
      </div>
      <span className="sr-only">{t("pages.loading")}</span>
    </div>
  );
}
