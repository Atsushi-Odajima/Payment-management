"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AgentForm } from "@/components/agent-form";
import { DetailRow } from "@/components/ui/detail-row";
import { ProviderStatusBadge } from "@/components/payment-status-badge";
import { useFormatDateTime, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import type { AgentView } from "@/lib/agents/types";
import { formatYen } from "@/lib/utils";

export interface LinkedMerchant {
  id: string;
  merchantCode: string;
  siteName: string;
  companyName: string;
  createdAt: Date;
}

export interface AgentFeeSummary {
  month: string;
  netAmount: number;
  fee: number;
  batchCount: number;
}

export function AgentDetailView({ agent: initial, merchants, fees }: { agent: AgentView; merchants: LinkedMerchant[]; fees: AgentFeeSummary }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [agent, setAgent] = useState<AgentView>(initial);
  const [editing, setEditing] = useState(false);

  return (
    <div>
      <PageHeader
        title={agent.name}
        description={`${agent.agentCode} · ${agent.companyName}`}
        helpHref="/manual/agents"
        breadcrumbs={[{ label: t("agents.title"), href: "/agents" }, { label: agent.agentCode }]}
        actions={
          editing ? (
            <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("agentDetail.editing")}</span>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              {t("agentDetail.edit")}
            </button>
          )
        }
      />

      {editing ? (
        <AgentForm
          mode="edit"
          agentId={agent.id}
          agentCode={agent.agentCode}
          initial={agent}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setAgent(saved);
            setEditing(false);
            toast.show(t("agentDetail.updated"));
            router.refresh();
          }}
        />
      ) : (
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="agent-account">
            <h2 id="agent-account" className="px-5 py-3 text-sm font-semibold text-slate-800">{t("agentForm.sectionAccount")}</h2>
            <DetailRow label={t("agentForm.agentCode")}><span className="font-mono">{agent.agentCode}</span></DetailRow>
            <DetailRow label={t("agentForm.status")}><ProviderStatusBadge active={agent.status === "active"} /></DetailRow>
            <DetailRow label={t("agentForm.feeRate")}><span className="tabular-nums">{t("agentDetail.feeRateValue", { rate: agent.feeRate })}</span></DetailRow>
            <DetailRow label={t("agents.thCreatedAt")}>{formatDate(agent.createdAt)}</DetailRow>
            <DetailRow label={t("agentDetail.updatedAt")}>{formatDate(agent.updatedAt)}</DetailRow>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="agent-company">
            <h2 id="agent-company" className="px-5 py-3 text-sm font-semibold text-slate-800">{t("agentForm.sectionCompany")}</h2>
            <DetailRow label={t("agentForm.name")}>{agent.name}</DetailRow>
            <DetailRow label={t("agentForm.nameKana")}>{agent.nameKana}</DetailRow>
            <DetailRow label={t("agentForm.companyName")}>{agent.companyName}</DetailRow>
            <DetailRow label={t("agentForm.contactName")}>{agent.contactName}</DetailRow>
            <DetailRow label={t("agentForm.email")}>
              <a href={`mailto:${agent.email}`} className="text-brand-700 hover:underline">{agent.email}</a>
            </DetailRow>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="agent-fees">
            <div className="flex items-center justify-between px-5 py-3">
              <h2 id="agent-fees" className="text-sm font-semibold text-slate-800">{t("agentDetail.feesTitle", { month: fees.month })}</h2>
              <Link href={`/agent-fees?month=${fees.month}&agent=${agent.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                {t("agentDetail.feesLink")}
              </Link>
            </div>
            <DetailRow label={t("agentFees.thNet")}><span className="tabular-nums">{formatYen(fees.netAmount)}</span></DetailRow>
            <DetailRow label={t("agentFees.thFee")}><span className="tabular-nums font-semibold text-brand-700">{formatYen(fees.fee)}</span></DetailRow>
            <DetailRow label={t("agentDetail.feesBatches")}>{t("dashboard.valueCount", { count: fees.batchCount })}</DetailRow>
          </section>

          <section className="card" aria-labelledby="agent-merchants">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 id="agent-merchants" className="text-sm font-semibold text-slate-800">{t("agentDetail.linkedMerchants")}</h2>
              <span className="text-xs text-slate-500">{t("dashboard.valueCount", { count: merchants.length })}</span>
            </div>
            {merchants.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("agentDetail.noLinkedMerchants")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3">{t("merchants.thCode")}</th>
                      <th scope="col" className="px-5 py-3">{t("merchants.thSiteName")}</th>
                      <th scope="col" className="px-5 py-3">{t("merchants.thCompany")}</th>
                      <th scope="col" className="px-5 py-3">{t("merchants.thCreatedAt")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {merchants.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-mono text-xs">
                          <Link href={`/merchants/${m.id}`} className="font-medium text-slate-900 hover:text-brand-700">{m.merchantCode}</Link>
                        </td>
                        <td className="px-5 py-3 text-slate-900">{m.siteName}</td>
                        <td className="px-5 py-3 text-slate-700">{m.companyName}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">{formatDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
