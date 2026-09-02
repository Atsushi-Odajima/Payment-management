"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ApplicationStatusBadge } from "@/components/application-status-badge";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { APPLICATION_STATUSES, type ApplicationView } from "@/lib/applications/types";
import { cn } from "@/lib/utils";

export interface MerchantFilterOption {
  id: string;
  merchantCode: string;
  siteName: string;
}

export function ApplicationsView({
  applications,
  merchants,
  status,
  merchantId,
  page,
  pageSize,
  total,
}: {
  applications: ApplicationView[];
  merchants: MerchantFilterOption[];
  status: string;
  merchantId: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();
  const params = { status: status || undefined, merchant: merchantId || undefined };
  const href = (next: Partial<typeof params>) => {
    const q = new URLSearchParams();
    const merged = { ...params, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/applications?${qs}` : "/applications";
  };

  return (
    <div>
      <PageHeader title={t("applications.title")} description={t("applications.description")} helpHref="/manual/applications" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("applications.thStatus")} className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <FilterLink href={href({ status: undefined })} active={!status} label={t("common.modeAll")} />
          {APPLICATION_STATUSES.map((s) => (
            <FilterLink key={s} href={href({ status: s })} active={status === s} label={t(`applicationEnums.status.${s}`)} />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span>{t("applications.filterMerchant")}</span>
          <select
            className="input w-auto py-1.5 text-xs"
            value={merchantId}
            onChange={(e) => router.push(href({ merchant: e.target.value || undefined }))}
          >
            <option value="">{t("common.modeAll")}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} — {m.siteName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card overflow-hidden">
        {total === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">{t("applications.empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">{t("applications.thCode")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thMerchant")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thType")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thMethod")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thStatus")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thAppliedAt")}</th>
                    <th scope="col" className="px-5 py-3">{t("applications.thReviewedAt")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications.map((a) => (
                    <tr key={a.id} className={cn("cursor-pointer hover:bg-slate-50/60", a.status === "pending" && "bg-amber-50/40")} onClick={() => router.push(`/applications/${a.id}`)}>
                      <td className="px-5 py-3 font-mono text-xs">
                        <Link href={`/applications/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {a.applicationCode}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{a.merchant.siteName}</p>
                        <p className="font-mono text-xs text-slate-500">{a.merchant.merchantCode}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{t(`applicationEnums.type.${a.type}`)}</td>
                      <td className="px-5 py-3 text-slate-700">{t(`applicationEnums.method.${a.method}`)}</td>
                      <td className="px-5 py-3"><ApplicationStatusBadge status={a.status} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(a.appliedAt)}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{a.reviewedAt ? formatDate(a.reviewedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination basePath="/applications" params={params} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
      {label}
    </Link>
  );
}
