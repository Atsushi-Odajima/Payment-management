"use client";

import Link from "next/link";
import { useFormatDateTime, useLang, useT } from "@/components/language-provider";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { methodLabel } from "@/components/views/transactions-view";
import type { TransactionListItem } from "@/lib/payments/list";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export interface MerchantStats {
  todayCount: number;
  todayAmount: number;
  openCount: number;
  pendingRefunds: number;
  failedWebhooks: number;
  nextPayout: { id: string; scheduledAt: Date | null; netAmount: number } | null;
}

export function MerchantDashboardView({ merchant, stats, recent, announcements }: { merchant: { merchantCode: string; siteName: string; emailNotification: string; email: string }; stats: MerchantStats; recent: TransactionListItem[]; announcements: Array<{ id: string; kind: string; title: string; publishFrom: Date }> }) {
  const t = useT();
  const { lang } = useLang();
  const formatDate = useFormatDateTime();
  const cards: Array<{ label: string; value: string; href: string }> = [
    { label: t("merchantPortal.dashboard.kpiToday"), value: t("merchantPortal.dashboard.valueAmount", { count: stats.todayCount, amount: formatYen(stats.todayAmount) }), href: "/merchant/transactions" },
    { label: t("merchantPortal.dashboard.kpiOpen"), value: t("merchantPortal.dashboard.valueCount", { count: stats.openCount }), href: "/merchant/transactions" },
    { label: t("merchantPortal.dashboard.kpiRefunds"), value: t("merchantPortal.dashboard.valueCount", { count: stats.pendingRefunds }), href: "/merchant/refunds" },
    { label: t("merchantPortal.dashboard.kpiWebhooks"), value: t("merchantPortal.dashboard.valueCount", { count: stats.failedWebhooks }), href: "/merchant/webhooks" },
    { label: t("merchantPortal.dashboard.kpiNextPayout"), value: stats.nextPayout ? `${stats.nextPayout.scheduledAt ? formatDate(stats.nextPayout.scheduledAt).slice(0, 10) : "—"} · ${formatYen(stats.nextPayout.netAmount)}` : t("merchantPortal.dashboard.none"), href: stats.nextPayout ? `/merchant/settlements/${stats.nextPayout.id}` : "/merchant/settlements" },
  ];
  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">{t("merchantPortal.dashboard.title", { name: merchant.siteName })}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("merchantPortal.dashboard.description", { code: merchant.merchantCode })}</p>
      <p className="mt-2 text-xs text-slate-500" data-testid="email-notification-setting">
        {t("merchantPortal.dashboard.emailNotification", { setting: t(`merchantEnums.emailNotification.${merchant.emailNotification}` as MessageKey), email: merchant.email })}
        <span className="ml-1">{t("merchantPortal.dashboard.emailNotificationHelp")}</span>
      </p>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card px-5 py-4 hover:border-brand-300">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">{c.value}</p>
          </Link>
        ))}
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-hidden" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-800">
            {t("merchantPortal.dashboard.recent")}
          </h2>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{t("merchantPortal.transactions.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link href={`/merchant/transactions/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <span>
                      <span className="font-medium text-slate-900">{p.orderNumber}</span>
                      <span className="ml-2 text-xs text-slate-500">{methodLabel(p.method, lang)} · {formatDate(p.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums font-medium">{formatYen(p.amount)}</span>
                      <PaymentStatusBadge status={p.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="ann-heading">
          <h2 id="ann-heading" className="text-sm font-semibold text-slate-800">
            {t("merchantPortal.dashboard.announcements")}
          </h2>
          {announcements.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("merchantPortal.dashboard.noAnnouncements")}</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {announcements.map((a) => (
                <li key={a.id}>
                  <Link href="/merchant/announcements" className="text-brand-700 hover:underline">
                    {a.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {t(`announcementEnums.kind.${a.kind}` as MessageKey)} · {formatDate(a.publishFrom).slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
