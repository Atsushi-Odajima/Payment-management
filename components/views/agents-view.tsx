"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ProviderStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AgentStatus } from "@/lib/agents/types";

export interface AgentListItem {
  id: string;
  agentCode: string;
  name: string;
  companyName: string;
  contactName: string;
  feeRate: number;
  status: AgentStatus;
  merchantCount: number;
  createdAt: Date;
}

export function AgentsView({
  agents,
  page,
  pageSize,
  total,
}: {
  agents: AgentListItem[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useT();
  const router = useRouter();
  const formatDate = useFormatDateTime();

  return (
    <div>
      <PageHeader
        title={t("agents.title")}
        description={t("agents.description")}
        helpHref="/manual/agents"
        actions={
          <Link href="/agents/new" className="btn-primary">
            {t("agents.add")}
          </Link>
        }
      />

      {total === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-base font-medium text-slate-800">{t("agents.empty")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("agents.emptySub")}</p>
          <Link href="/agents/new" className="btn-primary mt-6">
            {t("agents.add")}
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">{t("agents.thCode")}</th>
                  <th scope="col" className="px-5 py-3">{t("agents.thName")}</th>
                  <th scope="col" className="px-5 py-3">{t("agents.thCompany")}</th>
                  <th scope="col" className="px-5 py-3">{t("agents.thContact")}</th>
                  <th scope="col" className="px-5 py-3 text-right">{t("agents.thFeeRate")}</th>
                  <th scope="col" className="px-5 py-3 text-right">{t("agents.thMerchants")}</th>
                  <th scope="col" className="px-5 py-3">{t("agents.thStatus")}</th>
                  <th scope="col" className="px-5 py-3">{t("agents.thCreatedAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => router.push(`/agents/${a.id}`)}>
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link href={`/agents/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                        {a.agentCode}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{a.name}</td>
                    <td className="px-5 py-3 text-slate-700">{a.companyName}</td>
                    <td className="px-5 py-3 text-slate-700">{a.contactName}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{t("agentDetail.feeRateValue", { rate: a.feeRate })}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{a.merchantCount}</td>
                    <td className="px-5 py-3">
                      <ProviderStatusBadge active={a.status === "active"} />
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath="/agents" page={page} pageSize={pageSize} total={total} />
        </div>
      )}
    </div>
  );
}
