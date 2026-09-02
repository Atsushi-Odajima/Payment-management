"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MerchantForm } from "@/components/merchant-form";
import { useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { EMPTY_MERCHANT_INPUT } from "@/lib/merchants/schema";

export function MerchantNewView({ nextCode }: { nextCode: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();

  return (
    <div>
      <PageHeader
        title={t("merchantForm.titleCreate")}
        description={t("merchantForm.descriptionCreate")}
        breadcrumbs={[{ label: t("merchants.title"), href: "/merchants" }, { label: t("merchantForm.titleCreate") }]}
      />
      <MerchantForm
        mode="create"
        merchantCode={nextCode}
        initial={EMPTY_MERCHANT_INPUT}
        onSaved={(m) => {
          toast.show(t("merchantForm.toastCreated", { code: m.merchantCode }));
          router.push(`/merchants/${m.id}`);
        }}
        onCancel={() => router.push("/merchants")}
      />
    </div>
  );
}
