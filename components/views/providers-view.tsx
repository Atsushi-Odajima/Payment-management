"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ModeBadge, ProviderStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { CATEGORIES, getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn, type ProviderStatus } from "@/lib/utils";

export interface ProviderListItem {
  id: string;
  displayName: string;
  providerKey: string;
  category: string;
  testMode: boolean;
  status: ProviderStatus;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
}

export function ProvidersView({ providers }: { providers: ProviderListItem[] }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();

  return (
    <div>
      <PageHeader
        title={t("providers.title")}
        description={t("providers.description")}
        helpHref="/manual/dashboard"
        actions={
          <Link href="/providers/new" className="btn-primary">
            {t("providers.newConnection")}
          </Link>
        }
      />

      {providers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-base font-medium text-slate-800">{t("providers.empty")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("providers.emptySub")}</p>
          <Link href="/providers/new" className="btn-primary mt-6">
            {t("providers.emptyCta")}
          </Link>
          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.slice(0, 6).map((c) => (
              <Link
                key={c.key}
                href={`/providers/new?category=${c.key}`}
                className="rounded-lg border border-dashed border-slate-300 p-3 text-left text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p className="text-sm font-medium text-slate-800">{pickText(c.label, lang)}</p>
                <p className="mt-0.5 line-clamp-2">{pickText(c.description, lang)}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">{t("providers.thProvider")}</th>
                  <th scope="col" className="px-5 py-3">{t("providers.thCategory")}</th>
                  <th scope="col" className="px-5 py-3">{t("providers.thMode")}</th>
                  <th scope="col" className="px-5 py-3">{t("providers.thStatus")}</th>
                  <th scope="col" className="px-5 py-3">{t("providers.thLastTest")}</th>
                  <th scope="col" className="px-5 py-3 text-right">{t("providers.thActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((p) => {
                  const def = getProviderDefinition(p.providerKey);
                  const cat = getCategory(p.category);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-8 w-8 shrink-0 rounded-md"
                            style={{ background: def?.logoColor ?? "#94a3b8" }}
                            aria-hidden
                          />
                          <div>
                            <Link
                              href={`/providers/${p.id}`}
                              className="font-medium text-slate-900 hover:text-brand-700"
                            >
                              {p.displayName}
                            </Link>
                            <p className="text-xs text-slate-500">
                              {def ? pickText(def.name, lang) : p.providerKey}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{cat ? pickText(cat.label, lang) : p.category}</td>
                      <td className="px-5 py-3">
                        <ModeBadge live={!p.testMode} />
                      </td>
                      <td className="px-5 py-3">
                        <ProviderStatusBadge active={p.status === "active"} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {p.lastTestAt ? (
                          <>
                            {formatDate(p.lastTestAt)}
                            <span className={cn("ml-2", p.lastTestOk ? "text-emerald-700" : "text-rose-700")}>
                              {p.lastTestOk ? t("providers.testOk") : t("providers.testFailed")}
                            </span>
                          </>
                        ) : (
                          t("common.notTested")
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/providers/${p.id}`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          {t("providers.edit")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
