"use client";

import Link from "next/link";
import { useT } from "./language-provider";
import { useMode } from "./mode-provider";
import { Icon } from "./icons";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  helpHref,
}: {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  /** Link to the matching manual chapter, rendered as a "?" icon next to the title. */
  helpHref?: string;
}) {
  const t = useT();
  const { mode } = useMode();
  return (
    <div className="mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label={t("nav.breadcrumb")} className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1">
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="hover:text-slate-700">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-slate-700" aria-current={last ? "page" : undefined}>
                      {crumb.label}
                    </span>
                  )}
                  {!last && <span aria-hidden>/</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            {title}
            <span
              className={cn("badge text-[11px] font-semibold", mode === "live" ? "bg-rose-600 text-white ring-rose-700" : "bg-amber-100 text-amber-800 ring-amber-200")}
              title={t("mode.currentHint")}
              data-testid="current-mode"
            >
              {mode === "live" ? t("mode.currentLive") : t("mode.currentTest")}
            </span>
            {helpHref && (
              <Link
                href={helpHref}
                aria-label={t("nav.help")}
                title={t("nav.help")}
                className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Icon name="help" className="h-5 w-5" />
              </Link>
            )}
          </h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
