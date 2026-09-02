"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/provider-form";
import { ModeBadge, ProviderStatusBadge } from "@/components/payment-status-badge";
import { DetailRow } from "@/components/ui/detail-row";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn, type ProviderStatus } from "@/lib/utils";
import type { DisplayField } from "@/lib/providers/credentials";

export interface ProviderEditData {
  id: string;
  displayName: string;
  providerKey: string;
  status: ProviderStatus;
  testMode: boolean;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
  paymentsCount: number;
}

export function ProviderEditView({
  record,
  initialFields,
  showCreatedBanner,
}: {
  record: ProviderEditData;
  initialFields: Record<string, DisplayField>;
  showCreatedBanner: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const router = useRouter();
  const def = getProviderDefinition(record.providerKey);

  // Drop ?created=1 from the URL so a reload does not re-show the banner.
  useEffect(() => {
    if (showCreatedBanner) router.replace(`/providers/${record.id}`, { scroll: false });
  }, [showCreatedBanner, record.id, router]);

  if (!def) return null;
  const category = getCategory(def.category);

  return (
    <div>
      <PageHeader
        title={record.displayName}
        description={`${pickText(def.name, lang)} · ${category ? pickText(category.label, lang) : def.category}`}
        breadcrumbs={[
          { label: t("providerNew.breadcrumbProviders"), href: "/providers" },
          { label: record.displayName },
        ]}
        actions={
          <Link href="/payments/new" className="btn-secondary">
            {t("providerEdit.createTestPayment")}
          </Link>
        }
      />

      {showCreatedBanner && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {t("providerEdit.createdBanner")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <ProviderForm
          providerKey={record.providerKey}
          record={{
            id: record.id,
            displayName: record.displayName,
            status: record.status,
            testMode: record.testMode,
            paymentsCount: record.paymentsCount,
          }}
          initialFields={initialFields}
        />

        <aside className="space-y-4">
          <div className="card p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("providerEdit.statusTitle")}
            </p>
            <div className="mt-2 space-y-2">
              <DetailRow compact label={t("providerEdit.mode")}>
                <ModeBadge live={!record.testMode} />
              </DetailRow>
              <DetailRow compact label={t("providerEdit.state")}>
                <ProviderStatusBadge active={record.status === "active"} />
              </DetailRow>
              <DetailRow compact label={t("providerEdit.linkedPayments")}>
                {t("providerEdit.linkedPaymentsValue", { count: record.paymentsCount })}
              </DetailRow>
              <DetailRow compact label={t("providerEdit.lastTest")}>
                {record.lastTestAt ? (
                  <span className="text-xs text-slate-700">
                    {formatDate(record.lastTestAt)}
                    <span className={cn("ml-2", record.lastTestOk ? "text-emerald-700" : "text-rose-700")}>
                      {record.lastTestOk ? "✓" : "✗"}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">{t("common.notTested")}</span>
                )}
              </DetailRow>
              <DetailRow compact label={t("providerEdit.registeredAt")}>
                <span className="text-xs text-slate-700">{formatDate(record.createdAt)}</span>
              </DetailRow>
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{t("providerEdit.sensitiveTitle")}</p>
            <p className="mt-1">{t("providerEdit.sensitiveBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
