"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { IpRestrictionForm, type MerchantOption } from "@/components/ip-restriction-form";
import { useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { EMPTY_IP_INPUT } from "@/lib/ip-restrictions/schema";
import type { IpRestrictionInput } from "@/lib/ip-restrictions/types";

export function IpRestrictionEditView({
  mode,
  ruleId,
  initial,
  merchants,
}: {
  mode: "create" | "edit";
  ruleId?: string;
  initial?: IpRestrictionInput;
  merchants: MerchantOption[];
}) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const title = mode === "create" ? t("ipForm.titleCreate") : t("ipForm.titleEdit");
  return (
    <div>
      <PageHeader
        title={title}
        description={t("ipForm.description")}
        helpHref="/manual/ip-restrictions"
        breadcrumbs={[{ label: t("ipRestrictions.title"), href: "/ip-restrictions" }, { label: title }]}
      />
      <IpRestrictionForm
        mode={mode}
        ruleId={ruleId}
        initial={initial ?? EMPTY_IP_INPUT}
        merchants={merchants}
        onCancel={() => router.push("/ip-restrictions")}
        onSaved={() => {
          toast.show(mode === "create" ? t("ipForm.toastCreated") : t("ipForm.toastUpdated"));
          router.push("/ip-restrictions");
          router.refresh();
        }}
      />
    </div>
  );
}
