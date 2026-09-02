"use client";

// Merchant detail: read-only by default; "Edit" switches to the form, "Update"
// saves and returns to read-only with a toast. ID and password are never
// editable (password has reveal / regenerate for the master role).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MerchantForm } from "@/components/merchant-form";
import { MerchantPasswordField } from "@/components/merchant-password-field";
import { NotificationPreview } from "@/components/notification-preview";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import Link from "next/link";
import type { AgentOption, MerchantView } from "@/lib/merchants/types";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";

export function MerchantDetailView({ merchant: initial, agents }: { merchant: MerchantView; agents: AgentOption[] }) {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [merchant, setMerchant] = useState<MerchantView>(initial);
  const [editing, setEditing] = useState(false);

  const passwordSlot = (
    <>
      <MerchantPasswordField merchantId={merchant.id} />
    </>
  );

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
          ) : (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              {t("merchantDetail.edit")}
            </button>
          )
        }
      />

      {editing ? (
        <MerchantForm
          mode="edit"
          merchantId={merchant.id}
          merchantCode={merchant.merchantCode}
          initial={merchant}
          agents={agents}
          passwordSlot={passwordSlot}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setMerchant(saved);
            setEditing(false);
            toast.show(t("merchantDetail.updated"));
            router.refresh();
          }}
        />
      ) : (
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="sec-account">
            <h2 id="sec-account" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("merchantForm.sectionAccount")}
            </h2>
            <DetailRow label={t("merchantForm.merchantCode")}>
              <span className="font-mono">{merchant.merchantCode}</span>
            </DetailRow>
            <div className="px-5 py-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("merchantForm.password")}
              </p>
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
            <DetailRow label={t("merchantDetail.enabledMethods")}>
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
            <DetailRow label={t("merchantForm.emailNotification")}>
              {t(`merchantEnums.emailNotification.${merchant.emailNotification}`)}
            </DetailRow>
          </section>

          <section className="card" aria-labelledby="sec-notify">
            <div className="divide-y divide-slate-100">
              <h2 id="sec-notify" className="px-5 py-3 text-sm font-semibold text-slate-800">
                {t("merchantForm.sectionNotify")}
              </h2>
              <DetailRow label={t("merchantForm.notifyUrl")}>
                <span className="break-all font-mono text-xs">{merchant.notifyUrl}</span>
              </DetailRow>
              <DetailRow label={t("merchantForm.notifyFormat")}>
                {t(`merchantEnums.notifyFormat.${merchant.notifyFormat}`)}
              </DetailRow>
              <DetailRow label={t("merchantForm.notifyParamSet")}>
                {t(`merchantEnums.notifyParamSet.${merchant.notifyParamSet}`)}
              </DetailRow>
              <DetailRow label={t("merchantForm.notifyIdFormat")}>
                {t(`merchantEnums.notifyIdFormat.${merchant.notifyIdFormat}`)}
              </DetailRow>
            </div>
            <div className="p-5">
              <NotificationPreview config={merchant} merchantCode={merchant.merchantCode} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
