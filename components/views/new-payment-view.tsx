"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useT } from "@/components/language-provider";
import { NewPaymentForm, type MerchantChoice, type ProviderOption, type SuspendedControl } from "@/components/new-payment-form";

export function NewPaymentView({ providers, merchants, suspended = [] }: { providers: ProviderOption[]; merchants: MerchantChoice[]; suspended?: SuspendedControl[] }) {
  const t = useT();
  return (
    <div>
      <PageHeader
        title={t("newPayment.title")}
        description={t("newPayment.description")}
        helpHref="/manual/payments"
        breadcrumbs={[
          { label: t("newPayment.breadcrumbPayments"), href: "/payments" },
          { label: t("newPayment.title") },
        ]}
      />

      {providers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-10 text-center">
          <p className="text-sm font-medium text-slate-800">{t("newPayment.noProviders")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("newPayment.noProvidersSub")}</p>
          <Link href="/providers/new" className="btn-primary mt-4">
            {t("newPayment.connectProvider")}
          </Link>
        </div>
      ) : (
        <NewPaymentForm providers={providers} merchants={merchants} suspended={suspended} />
      )}
    </div>
  );
}
