"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useLang, useT } from "@/components/language-provider";
import {
  CATEGORIES,
  PROVIDERS,
  getCategory,
  providersByCategory,
} from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";

export function ProviderCatalogView({
  selectedCategory,
}: {
  selectedCategory?: string;
}) {
  const t = useT();
  const { lang } = useLang();
  const category = selectedCategory ? getCategory(selectedCategory) : undefined;

  if (category) {
    const list = providersByCategory(category.key);
    return (
      <div>
        <PageHeader
          title={pickText(category.label, lang)}
          description={pickText(category.description, lang)}
          breadcrumbs={[
            { label: t("providerNew.breadcrumbProviders"), href: "/providers" },
            { label: t("providerNew.breadcrumbNew"), href: "/providers/new" },
            { label: pickText(category.label, lang) },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const name = pickText(p.name, lang);
            return (
              <Link
                key={p.key}
                href={`/providers/new/${p.key}`}
                className="card group flex flex-col gap-3 p-5 transition hover:border-brand-300 hover:shadow"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-lg text-sm font-semibold text-white shadow-sm"
                    style={{ background: p.logoColor }}
                    aria-hidden
                  >
                    {name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.supportsTestMode
                        ? t("providerNew.supportsTestMode")
                        : t("providerNew.liveOnly")}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  {pickText(p.description, lang)}
                </p>
                <span className="mt-auto text-xs font-medium text-brand-700 group-hover:underline">
                  {t("providerNew.configureConnection")}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mt-8">
          <Link
            href="/providers/new"
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {t("providerNew.backToCategories")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("providerNew.title")}
        description={t("providerNew.description")}
        breadcrumbs={[
          { label: t("providerNew.breadcrumbProviders"), href: "/providers" },
          { label: t("providerNew.breadcrumbNew") },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const providerCount = PROVIDERS.filter(
            (p) => p.category === c.key,
          ).length;
          return (
            <Link
              key={c.key}
              href={`/providers/new?category=${c.key}`}
              className="card group flex flex-col gap-3 p-5 transition hover:border-brand-300 hover:shadow"
            >
              <div className="flex items-center gap-3">
                <CategoryIcon name={c.icon} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {pickText(c.label, lang)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("providerNew.servicesCount", { count: providerCount })}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                {pickText(c.description, lang)}
              </p>
              <span className="mt-auto text-xs font-medium text-brand-700 group-hover:underline">
                {t("providerNew.chooseCategory")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CategoryIcon({ name }: { name: string }) {
  const base =
    "grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700";
  const props = {
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "credit":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
            <path d="M2.5 10h19M6 15h4" />
          </svg>
        </span>
      );
    case "qr":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
          </svg>
        </span>
      );
    case "store":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <path d="M3 8l1.5-4h15L21 8M3 8v11h18V8M3 8h18M9 12h6" />
          </svg>
        </span>
      );
    case "bank":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <path d="M3 9l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" />
          </svg>
        </span>
      );
    default:
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
          </svg>
        </span>
      );
  }
}
