"use client";

// Payment link detail: the shareable URL with its QR code, usage counters,
// the disable button, and the transactions the link produced.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { PageHeader } from "@/components/page-header";
import { DetailRow } from "@/components/ui/detail-row";
import { PaymentLinkStatusBadge } from "@/components/subscription-badges";
import { ModeBadge, PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import type { LinkPaymentRow, PaymentLinkRow } from "@/lib/payment-links/list";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { isPaymentMethod } from "@/lib/payments/methods";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export function PaymentLinkDetailView({ link, payments }: { link: PaymentLinkRow; payments: LinkPaymentRow[] }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const formatDate = useFormatDateTime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The absolute URL depends on the browser origin, so it is filled in after mount.
  const [url, setUrl] = useState(`/pay/${link.token}`);
  useEffect(() => {
    setUrl(`${window.location.origin}/pay/${link.token}`);
  }, [link.token]);
  const qr = renderSVG(url, { border: 1 });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t("paymentLinks.copied"));
    } catch {
      toast.show(t("paymentLinks.copyFailed"));
    }
  }

  async function disable() {
    const ok = await confirm({ title: t("paymentLinks.disable"), body: t("paymentLinks.disableConfirm"), confirmLabel: t("paymentLinks.disable"), tone: "danger" });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await apiJson(`/api/payment-links/${link.id}/disable`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("paymentLinks.disabled"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={link.productName}
        description={`${link.merchant.merchantCode} · ${link.merchant.siteName} · ${formatYen(link.amount)}`}
        helpHref="/manual/payment-links"
        breadcrumbs={[{ label: t("paymentLinks.title"), href: "/payment-links" }, { label: link.productName }]}
        actions={
          <>
            <ModeBadge live={link.livemode} />
            <PaymentLinkStatusBadge status={link.status} unavailable={link.unavailable} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card divide-y divide-slate-100" aria-labelledby="link-heading">
            <h2 id="link-heading" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("paymentLinks.sectionLink")}
            </h2>
            <DetailRow label={t("paymentLinks.thUrl")}>
              <div className="flex flex-wrap items-center gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-brand-700 hover:underline">
                  {url}
                </a>
                <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={copy}>
                  {t("paymentLinks.copy")}
                </button>
              </div>
            </DetailRow>
            <DetailRow label={t("paymentLinks.thMerchant")}>
              <Link href={`/merchants/${link.merchant.id}`} className="text-brand-700 hover:underline">
                {link.merchant.merchantCode} — {link.merchant.siteName}
              </Link>
            </DetailRow>
            <DetailRow label={t("paymentLinks.thProduct")}>{link.productName}</DetailRow>
            <DetailRow label={t("paymentLinks.thAmount")}>
              <span className="tabular-nums">{formatYen(link.amount)}</span>
            </DetailRow>
            <DetailRow label={t("paymentLinks.descriptionLabel")}>{link.description || "—"}</DetailRow>
            <DetailRow label={t("paymentLinks.thUses")}>
              <span className="tabular-nums">
                {link.usedCount}
                {link.maxUses ? ` / ${link.maxUses}` : ` (${t("paymentLinks.unlimited")})`}
              </span>
            </DetailRow>
            <DetailRow label={t("paymentLinks.thExpires")}>{link.expiresAt ? formatDate(new Date(link.expiresAt.getTime() - 1)) : t("paymentLinks.noExpiry")}</DetailRow>
            <DetailRow label={t("paymentLinks.thCreated")}>{formatDate(link.createdAt)}</DetailRow>
          </section>

          <section className="card overflow-hidden" aria-labelledby="link-payments">
            <h2 id="link-payments" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
              {t("paymentLinks.paymentsHeading", { count: payments.length })}
            </h2>
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">{t("paymentLinks.noPayments")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                    <span>
                      <Link href={`/payments/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.orderNumber}
                      </Link>
                      <span className="ml-2 text-xs text-slate-500">
                        {p.customerName ?? "—"} · {isPaymentMethod(p.method) ? t(`paymentMethods.${p.method}` as MessageKey) : "—"} · {formatDate(p.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatYen(p.amount)}</span>
                      {isPaymentStatus(p.status) && <PaymentStatusBadge status={p.status} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentLinks.qrTitle")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, no optimisation needed */}
            <img className="mx-auto mt-3 w-48 rounded-lg border border-slate-200 bg-white p-2" alt={t("paymentLinks.qrAlt")} src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} />
            <p className="mt-2 text-center text-xs text-slate-500">{t("paymentLinks.qrHelp")}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("paymentDetail.actions")}</p>
            <div className="mt-3 space-y-2" aria-busy={busy}>
              {link.status === "active" ? (
                <button type="button" className="btn-danger w-full" disabled={busy} onClick={disable}>
                  {busy ? t("common.processing") : t("paymentLinks.disable")}
                </button>
              ) : (
                <p className="text-xs text-slate-500">{t("paymentLinks.alreadyDisabled")}</p>
              )}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
