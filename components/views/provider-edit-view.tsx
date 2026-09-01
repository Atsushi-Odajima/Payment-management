"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/provider-form";
import {
  useFormatDateTime,
  useLang,
  useT,
} from "@/components/language-provider";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ProviderEditData {
  id: string;
  displayName: string;
  providerKey: string;
  status: string;
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
  initialFields: Record<string, { value: string; masked: boolean }>;
  showCreatedBanner: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const def = getProviderDefinition(record.providerKey);
  if (!def) return null;
  const category = getCategory(def.category);

  return (
    <div>
      <PageHeader
        title={record.displayName}
        description={`${pickText(def.name, lang)} ・ ${
          category ? pickText(category.label, lang) : def.category
        }`}
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
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
          }}
          initialFields={initialFields}
        />

        <aside className="space-y-4">
          <div className="card p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("providerEdit.statusTitle")}
            </p>
            <div className="mt-2 space-y-2">
              <Row label={t("providerEdit.mode")}>
                <span
                  className={cn(
                    "badge",
                    record.testMode
                      ? "bg-amber-100 text-amber-800 ring-amber-200"
                      : "bg-emerald-100 text-emerald-800 ring-emerald-200",
                  )}
                >
                  {record.testMode ? t("common.test") : t("common.live")}
                </span>
              </Row>
              <Row label={t("providerEdit.state")}>
                <span
                  className={cn(
                    "badge",
                    record.status === "active"
                      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                      : "bg-slate-200 text-slate-700 ring-slate-300",
                  )}
                >
                  {record.status === "active"
                    ? t("common.enabled")
                    : t("common.disabled")}
                </span>
              </Row>
              <Row label={t("providerEdit.linkedPayments")}>
                {t("providerEdit.linkedPaymentsValue", {
                  count: record.paymentsCount,
                })}
              </Row>
              <Row label={t("providerEdit.lastTest")}>
                {record.lastTestAt ? (
                  <span className="text-xs text-slate-700">
                    {formatDate(record.lastTestAt)}
                    <span
                      className={cn(
                        "ml-2",
                        record.lastTestOk ? "text-emerald-700" : "text-rose-700",
                      )}
                    >
                      {record.lastTestOk ? "✓" : "✗"}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    {t("common.notTested")}
                  </span>
                )}
              </Row>
              <Row label={t("providerEdit.registeredAt")}>
                <span className="text-xs text-slate-700">
                  {formatDate(record.createdAt)}
                </span>
              </Row>
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              {t("providerEdit.sensitiveTitle")}
            </p>
            <p className="mt-1">{t("providerEdit.sensitiveBody")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}
