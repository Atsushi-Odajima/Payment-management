"use client";

import Link from "next/link";
import { useT } from "./language-provider";
import { cn } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 20;

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** "1–20 / 45" summary plus previous / next links that keep other query params. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params?: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const link = (label: string, p: number, disabled: boolean) =>
    disabled ? (
      <span className="rounded-md px-3 py-1.5 text-xs text-slate-300" aria-disabled="true">
        {label}
      </span>
    ) : (
      <Link href={href(p)} className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
        {label}
      </Link>
    );

  return (
    <nav
      aria-label={t("pagination.label")}
      className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500")}
    >
      <span className="tabular-nums">{t("pagination.range", { from, to, total })}</span>
      <span className="flex items-center gap-1">
        {link(t("pagination.prev"), page - 1, page <= 1)}
        <span className="tabular-nums">{t("pagination.page", { page, pages })}</span>
        {link(t("pagination.next"), page + 1, page >= pages)}
      </span>
    </nav>
  );
}
