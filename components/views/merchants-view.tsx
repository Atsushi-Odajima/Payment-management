"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { EmailNotification } from "@/lib/merchants/types";

export interface MerchantListItem {
  id: string;
  merchantCode: string;
  siteName: string;
  companyName: string;
  contactName: string;
  emailNotification: EmailNotification;
  createdAt: Date;
}

export function MerchantsView({ merchants }: { merchants: MerchantListItem[] }) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();

  return (
    <div>
      <PageHeader
        title={t("merchants.title")}
        description={t("merchants.description")}
        actions={
          <Link href="/merchants/new" className="btn-primary">
            {t("merchants.add")}
          </Link>
        }
      />

      {merchants.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-base font-medium text-slate-800">{t("merchants.empty")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("merchants.emptySub")}</p>
          <Link href="/merchants/new" className="btn-primary mt-6">
            {t("merchants.add")}
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">{t("merchants.thCode")}</th>
                  <th scope="col" className="px-5 py-3">{t("merchants.thSiteName")}</th>
                  <th scope="col" className="px-5 py-3">{t("merchants.thCompany")}</th>
                  <th scope="col" className="px-5 py-3">{t("merchants.thContact")}</th>
                  <th scope="col" className="px-5 py-3">{t("merchants.thEmailNotification")}</th>
                  <th scope="col" className="px-5 py-3">{t("merchants.thCreatedAt")}</th>
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">{t("merchants.thActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {merchants.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer hover:bg-slate-50/60"
                    onClick={() => router.push(`/merchants/${m.id}`)}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">
                      <Link
                        href={`/merchants/${m.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.merchantCode}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{m.siteName}</td>
                    <td className="px-5 py-3 text-slate-700">{m.companyName}</td>
                    <td className="px-5 py-3 text-slate-700">{m.contactName}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {t(`merchantEnums.emailNotification.${m.emailNotification}`)}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDate(m.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/merchants/${m.id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("merchants.open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
