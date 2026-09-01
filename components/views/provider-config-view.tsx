"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/provider-form";
import { useLang, useT } from "@/components/language-provider";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";

export function ProviderConfigView({ providerKey }: { providerKey: string }) {
  const t = useT();
  const { lang } = useLang();
  const def = getProviderDefinition(providerKey);
  if (!def) return null;
  const category = getCategory(def.category);
  const name = pickText(def.name, lang);

  return (
    <div>
      <PageHeader
        title={t("providerConfig.title", { name })}
        description={pickText(def.description, lang)}
        breadcrumbs={[
          { label: t("providerNew.breadcrumbProviders"), href: "/providers" },
          { label: t("providerNew.breadcrumbNew"), href: "/providers/new" },
          {
            label: category ? pickText(category.label, lang) : def.category,
            href: `/providers/new?category=${def.category}`,
          },
          { label: name },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <ProviderForm providerKey={def.key} />

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("providerConfig.fieldsToEnter")}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {def.fields.map((f) => (
                <li key={f.key} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>
                    {pickText(f.label, lang)}
                    {f.required && <span className="ml-1 text-rose-600">*</span>}
                    {f.secret && (
                      <span className="ml-2 text-xs text-slate-500">
                        {t("providerConfig.encrypted")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              {t("providerConfig.securityTitle")}
            </p>
            <p className="mt-1">{t("providerConfig.securityBody")}</p>
          </div>
          {def.docsUrl && (
            <Link
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="card block p-4 text-xs text-brand-700 hover:bg-brand-50/40"
            >
              {t("providerConfig.openDocs", { name })}
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
