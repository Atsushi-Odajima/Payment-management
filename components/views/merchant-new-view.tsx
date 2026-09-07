"use client";

// Merchant registration. After a successful save the page shows the
// completion card once: the assigned merchant code and the auto-issued test
// signing secret (Phase P1-4), which is shown exactly once like an API key.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { MerchantForm } from "@/components/merchant-form";
import { useT } from "@/components/language-provider";
import { useToast } from "@/components/toast";
import { EMPTY_MERCHANT_INPUT } from "@/lib/merchants/schema";
import type { AgentOption, MerchantView } from "@/lib/merchants/types";

interface Created {
  merchant: MerchantView;
  signingSecret: { plaintext: string; key: { keyPrefix: string } } | null;
}

export function MerchantNewView({ nextCode, agents }: { nextCode: string; agents: AgentOption[] }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!created?.signingSecret) return;
    try {
      await navigator.clipboard.writeText(created.signingSecret.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context); the value is selectable on screen.
    }
  }

  return (
    <div>
      <PageHeader
        title={t("merchantForm.titleCreate")}
        description={created ? t("merchantForm.createdDescription") : t("merchantForm.descriptionCreate")}
        helpHref="/manual/merchants"
        breadcrumbs={[{ label: t("merchants.title"), href: "/merchants" }, { label: t("merchantForm.titleCreate") }]}
      />
      {created ? (
        <section className="card space-y-5 p-6" aria-labelledby="created-heading">
          <div>
            <h2 id="created-heading" className="text-base font-semibold text-slate-900">
              {t("merchantForm.createdTitle", { code: created.merchant.merchantCode })}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("merchantForm.createdSiteLine", { site: created.merchant.siteName })}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">{t("merchantForm.signingSecretTitle")}</p>
            <p className="mt-1 text-xs text-amber-800">{t("merchantForm.signingSecretHelp")}</p>
            {created.signingSecret ? (
              <>
                <code className="mt-3 block break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900" data-testid="signing-secret">
                  {created.signingSecret.plaintext}
                </code>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={copy}>
                    {copied ? t("adminForm.copied") : t("apiKeys.copy")}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-amber-800">{t("merchantForm.signingSecretUnavailable")}</p>
            )}
          </div>
          <p className="text-xs text-slate-500">{t("merchantForm.signingSecretLive")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-primary" onClick={() => router.push(`/merchants/${created.merchant.id}`)}>
              {t("merchantForm.goToDetail")}
            </button>
          </div>
        </section>
      ) : (
        <MerchantForm
          mode="create"
          merchantCode={nextCode}
          initial={EMPTY_MERCHANT_INPUT}
          agents={agents}
          onSaved={(m, extra) => {
            toast.show(t("merchantForm.toastCreated", { code: m.merchantCode }));
            setCreated({ merchant: m, signingSecret: extra?.signingSecret ?? null });
            window.scrollTo({ top: 0 });
          }}
          onCancel={() => router.push("/merchants")}
        />
      )}
    </div>
  );
}
