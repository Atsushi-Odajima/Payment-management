"use client";

// Two-column manual: chapter list (left) and the rendered chapter (right),
// with an in-page outline of the chapter's sections.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useT } from "@/components/language-provider";
import { MANUAL_CHAPTERS, type ManualChapter } from "@/lib/manual/chapters";
import type { Heading } from "@/lib/manual/markdown";
import { cn } from "@/lib/utils";

export function ManualView({
  chapter,
  headings,
  children,
}: {
  chapter: ManualChapter;
  headings: Heading[];
  children: React.ReactNode;
}) {
  const t = useT();
  const index = MANUAL_CHAPTERS.indexOf(chapter);
  const prev = index > 0 ? MANUAL_CHAPTERS[index - 1] : null;
  const next = index < MANUAL_CHAPTERS.length - 1 ? MANUAL_CHAPTERS[index + 1] : null;

  return (
    <div>
      <PageHeader title={t("manual.title")} description={t("manual.description")} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label={t("manual.toc")} className="card self-start p-3 lg:sticky lg:top-6">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("manual.toc")}</p>
          <ol className="space-y-0.5">
            {MANUAL_CHAPTERS.map((c, i) => {
              const active = c === chapter;
              return (
                <li key={c}>
                  <Link
                    href={`/manual/${c}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm transition",
                      active ? "bg-brand-50 font-medium text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <span className="w-5 shrink-0 tabular-nums text-xs text-slate-400">{i + 1}.</span>
                    <span>{t(`manual.chapters.${c}`)}</span>
                  </Link>
                  {active && headings.length > 0 && (
                    <ul className="mb-1 ml-7 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
                      {headings.map((h) => (
                        <li key={h.id}>
                          <a href={`#${h.id}`} className={cn("block truncate py-0.5 text-xs text-slate-500 hover:text-brand-700", h.level === 3 && "pl-3")}>
                            {h.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <article className="card min-w-0 px-6 py-8 sm:px-10">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            {t("manual.chapterLabel", { n: index + 1, total: MANUAL_CHAPTERS.length })}
          </p>
          <div className="max-w-3xl">{children}</div>
          <div className="mt-12 flex items-center justify-between border-t border-slate-100 pt-6 text-sm">
            {prev ? (
              <Link href={`/manual/${prev}`} className="text-brand-700 hover:underline">
                ← {t(`manual.chapters.${prev}`)}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/manual/${next}`} className="text-brand-700 hover:underline">
                {t(`manual.chapters.${next}`)} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
