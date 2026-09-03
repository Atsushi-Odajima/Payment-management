"use client";

// Merchant detail with tabs: basic / contract & fees / limits / API keys /
// notifications. Basic and notification tabs use the shared MerchantForm in
// edit mode (Edit → Update); the other tabs have their own small forms.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MerchantForm } from "@/components/merchant-form";
import { MerchantPasswordField } from "@/components/merchant-password-field";
import { NotificationPreview } from "@/components/notification-preview";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { ContractTab } from "@/components/merchant-tabs/contract-tab";
import { LimitsTab } from "@/components/merchant-tabs/limits-tab";
import { ApiKeysTab } from "@/components/merchant-tabs/api-keys-tab";
import { SettlementTab } from "@/components/merchant-tabs/settlement-tab";
import type { AgentOption, MerchantView } from "@/lib/merchants/types";
import { MERCHANT_TABS, type MerchantContract, type MerchantLimits, type MerchantSettlement, type MerchantTab } from "@/lib/merchants/tabs";
import type { ApiKeyView } from "@/lib/merchants/api-keys";
import type { DataMode } from "@/lib/mode";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface MerchantDetailProps {
  merchant: MerchantView;
  agents: AgentOption[];
  tab: MerchantTab;
  contract: MerchantContract;
  limits: MerchantLimits;
  apiKeys: ApiKeyView[];
  settlement: MerchantSettlement;
  mode: DataMode;
}

export function MerchantDetailView({ merchant: initial, agents, tab, contract, limits, apiKeys, settlement, mode }: MerchantDetailProps) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [merchant, setMerchant] = useState<MerchantView>(initial);
  const [editing, setEditing] = useState(false);
  const editable = tab === "basic" || tab === "notify";

  const tabHref = (k: MerchantTab) => (k === "basic" ? `/merchants/${merchant.id}` : `/merchants/${merchant.id}?tab=${k}`);

  return (
    <div>
      <PageHeader
        title={merchant.siteName}
        description={`${merchant.merchantCode} · ${merchant.companyName}`}
        helpHref="/manual/merchants"
        breadcrumbs={[{ label: t("merchants.title"), href: "/merchants" }, { label: merchant.merchantCode }]}
        actions={
          editing ? (
            <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("merchantDetail.editing")}</span>
          ) : editable ? (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              {t("merchantDetail.edit")}
            </button>
          ) : null
        }
      />

      <nav aria-label={t("merchantTabs.label")} className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {MERCHANT_TABS.map((k) => (
          <Link
            key={k}
            href={tabHref(k)}
            aria-current={tab === k ? "page" : undefined}
            onClick={() => setEditing(false)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {t(`merchantTabs.${k}` as MessageKey)}
          </Link>
        ))}
      </nav>

      {editing ? (
        <MerchantForm
          mode="edit"
          merchantId={merchant.id}
          merchantCode={merchant.merchantCode}
          initial={merchant}
          agents={agents}
          passwordSlot={<MerchantPasswordField merchantId={merchant.id} />}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setMerchant(saved);
            setEditing(false);
            toast.show(t("merchantDetail.updated"));
            router.refresh();
          }}
        />
      ) : tab === "basic" ? (
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="sec-account">
            <h2 id="sec-account" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionAccount")}
            </h2>
            <DetailRow label={t("merchantForm.merchantCode")}>
              <span className="font-mono">{merchant.merchantCode}</span>
            </DetailRow>
            <div className="px-5 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{t("merchantForm.password")}</p>
              <MerchantPasswordField merchantId={merchant.id} />
            </div>
            <DetailRow label={t("merchants.thCreatedAt")}>{formatDate(merchant.createdAt)}</DetailRow>
            <DetailRow label={t("merchantDetail.updatedAt")}>{formatDate(merchant.updatedAt)}</DetailRow>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="sec-site">
            <h2 id="sec-site" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionSite")}
            </h2>
            <DetailRow label={t("merchantForm.siteName")}>{merchant.siteName}</DetailRow>
            <DetailRow label={t("merchantForm.siteNameKana")}>{merchant.siteNameKana}</DetailRow>
            <DetailRow label={t("merchantForm.companyName")}>{merchant.companyName}</DetailRow>
            <DetailRow label={t("merchantForm.contactName")}>{merchant.contactName}</DetailRow>
            <DetailRow label={t("merchantForm.agent")}>
              {merchant.agent ? (
                <Link href={`/agents/${merchant.agent.id}`} className="text-brand-700 hover:underline">
                  {merchant.agent.agentCode} — {merchant.agent.name}
                </Link>
              ) : (
                <span className="text-slate-500">{t("merchantForm.agentNone")}</span>
              )}
            </DetailRow>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="sec-payment">
            <h2 id="sec-payment" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionPayment")}
            </h2>
            <DetailRow label={t("merchantForm.enabledMethods")}>
              {merchant.enabledMethods.length === 0 ? (
                <span className="text-slate-500">{t("merchantDetail.noEnabledMethods")}</span>
              ) : (
                <span className="flex flex-wrap justify-end gap-1">
                  {merchant.enabledMethods.map((m) => {
                    const c = CATEGORIES.find((x) => x.key === m);
                    return (
                      <span key={m} className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">
                        {c ? pickText(c.label, lang) : m}
                      </span>
                    );
                  })}
                </span>
              )}
            </DetailRow>
            <DetailRow label={t("merchantForm.transferIdDigits")}>{t("merchantForm.digits", { n: merchant.transferIdDigits })}</DetailRow>
          </section>

          <section className="card divide-y divide-slate-100" aria-labelledby="sec-contact">
            <h2 id="sec-contact" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionContact")}
            </h2>
            <DetailRow label={t("merchantForm.email")}>
              <a href={`mailto:${merchant.email}`} className="text-brand-700 hover:underline">
                {merchant.email}
              </a>
            </DetailRow>
            <DetailRow label={t("merchantForm.statementEmail")}>
              <a href={`mailto:${merchant.statementEmail}`} className="text-brand-700 hover:underline">
                {merchant.statementEmail}
              </a>
            </DetailRow>
            <DetailRow label={t("merchantForm.emailNotification")}>{t(`merchantEnums.emailNotification.${merchant.emailNotification}`)}</DetailRow>
          </section>
        </div>
      ) : tab === "contract" ? (
        <ContractTab merchantId={merchant.id} contract={contract} />
      ) : tab === "limits" ? (
        <LimitsTab merchantId={merchant.id} data={limits} mode={mode} />
      ) : tab === "apikeys" ? (
        <ApiKeysTab merchantId={merchant.id} merchantCode={merchant.merchantCode} keys={apiKeys} />
      ) : tab === "settlement" ? (
        <SettlementTab merchantId={merchant.id} data={settlement} />
      ) : (
        <section className="card" aria-labelledby="sec-notify">
          <div className="divide-y divide-slate-100">
            <h2 id="sec-notify" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionNotify")}
            </h2>
            <DetailRow label={t("merchantForm.notifyUrl")}>
              <span className="break-all font-mono text-xs">{merchant.notifyUrl}</span>
            </DetailRow>
            <DetailRow label={t("merchantForm.notifyFormat")}>{t(`merchantEnums.notifyFormat.${merchant.notifyFormat}`)}</DetailRow>
            <DetailRow label={t("merchantForm.notifyParamSet")}>{t(`merchantEnums.notifyParamSet.${merchant.notifyParamSet}`)}</DetailRow>
            <DetailRow label={t("merchantForm.notifyIdFormat")}>{t(`merchantEnums.notifyIdFormat.${merchant.notifyIdFormat}`)}</DetailRow>
          </div>
          <div className="p-5">
            <NotificationPreview config={merchant} merchantCode={merchant.merchantCode} />
          </div>
        </section>
      )}
    </div>
  );
}
