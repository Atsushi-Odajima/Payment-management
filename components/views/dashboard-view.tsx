"use client";

// Dashboard: one card per implemented navigation item, grouped exactly like
// the sidebar (lib/nav.ts), each with its headline figure.

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icons";
import { useT } from "@/components/language-provider";
import { useRole } from "@/components/session-provider";
import { visibleNavGroups, type NavItem } from "@/lib/nav";
import type { MessageKey } from "@/lib/i18n";
import { formatYen } from "@/lib/utils";

export interface DashboardStats {
  unreadNotificationCount: number;
  unmatchedDepositCount: number;
  subscriptionActiveCount: number;
  subscriptionAttentionCount: number;
  paymentLinkActiveCount: number;
  agentFeeMonthAmount: number;
  pendingRefundCount: number;
  webhookFailedCount: number;
  chargebackOpenCount: number;
  blacklistCandidateCount: number;
  depositDiffOpenCount: number;
  monthPaymentCount: number;
  monthPaymentAmount: number;
  emailTodayCount: number;
  announcementActiveCount: number;
  templateEnabledCount: number;
  settlementOpenCount: number;
  settlementScheduledAmount: number;
  merchantCount: number;
  customerCount: number;
  agentCount: number;
  todayPaymentCount: number;
  todayPaymentAmount: number;
  openTransactionCount: number;
  overdueTransferCount: number;
  activeIpRuleCount: number;
  adminCount: number;
  auditTodayCount: number;
  providerCount: number;
  manualChapterCount: number;
}

export function DashboardView({ stats }: { stats: DashboardStats }) {
  const t = useT();
  const { can } = useRole();
  const groups = visibleNavGroups(can);

  const figure = (item: NavItem): { value: string; badge?: string } => {
    switch (item.key) {
      case "applications":
        return {
          value: t("dashboard.valueOpen", { count: stats.openTransactionCount }),
          badge: stats.overdueTransferCount > 0 ? t("dashboard.overdueBadge", { count: stats.overdueTransferCount }) : undefined,
        };
      case "payments":
        return { value: t("dashboard.valueToday", { count: stats.todayPaymentCount, amount: formatYen(stats.todayPaymentAmount) }) };
      case "refunds":
        return {
          value: t("dashboard.valuePendingRefunds", { count: stats.pendingRefundCount }),
          badge: stats.pendingRefundCount > 0 ? t("dashboard.reviewBadge") : undefined,
        };
      case "settlements":
        return { value: t("dashboard.valueSettlements", { count: stats.settlementOpenCount, amount: formatYen(stats.settlementScheduledAmount) }) };
      case "chargebacks":
        return { value: t("dashboard.valueChargebacks", { count: stats.chargebackOpenCount }), badge: stats.chargebackOpenCount > 0 ? t("dashboard.disputeBadge") : undefined };
      case "blacklist":
        return { value: t("dashboard.valueCandidates", { count: stats.blacklistCandidateCount }), badge: stats.blacklistCandidateCount > 0 ? t("dashboard.reviewBadge") : undefined };
      case "depositDiffs":
        return { value: t("dashboard.valueDepositDiffs", { count: stats.depositDiffOpenCount }), badge: stats.depositDiffOpenCount > 0 ? t("dashboard.openBadge") : undefined };
      case "reports":
        return { value: t("dashboard.valueMonth", { count: stats.monthPaymentCount, amount: formatYen(stats.monthPaymentAmount) }) };
      case "emailLogs":
        return { value: t("dashboard.valueAuditToday", { count: stats.emailTodayCount }) };
      case "emailTemplates":
        return { value: t("dashboard.valueActive", { count: stats.templateEnabledCount }) };
      case "announcements":
        return { value: t("dashboard.valueActive", { count: stats.announcementActiveCount }) };
      case "webhookLogs":
        return {
          value: t("dashboard.valueWebhookFailed", { count: stats.webhookFailedCount }),
          badge: stats.webhookFailedCount > 0 ? t("dashboard.failedBadge") : undefined,
        };
      case "notifications":
        return { value: t("dashboard.valueUnread", { count: stats.unreadNotificationCount }), badge: stats.unreadNotificationCount > 0 ? t("dashboard.unreadBadge") : undefined };
      case "unmatchedDeposits":
        return { value: t("dashboard.valueUnmatched", { count: stats.unmatchedDepositCount }), badge: stats.unmatchedDepositCount > 0 ? t("dashboard.openBadge") : undefined };
      case "subscriptions":
        return { value: t("dashboard.valueSubscriptions", { count: stats.subscriptionActiveCount }), badge: stats.subscriptionAttentionCount > 0 ? t("dashboard.valuePastDue", { count: stats.subscriptionAttentionCount }) : undefined };
      case "paymentLinks":
        return { value: t("dashboard.valueLinks", { count: stats.paymentLinkActiveCount }) };
      case "agentFees":
        return { value: t("dashboard.valueAgentFees", { amount: formatYen(stats.agentFeeMonthAmount) }) };
      case "merchants":
        return { value: t("dashboard.valueCount", { count: stats.merchantCount }) };
      case "customers":
        return { value: t("dashboard.valueCount", { count: stats.customerCount }) };
      case "agents":
        return { value: t("dashboard.valueCount", { count: stats.agentCount }) };
      case "admins":
        return { value: t("dashboard.valueCount", { count: stats.adminCount }) };
      case "ipRestrictions":
        return { value: t("dashboard.valueRules", { count: stats.activeIpRuleCount }) };
      case "auditLogs":
        return { value: t("dashboard.valueAuditToday", { count: stats.auditTodayCount }) };
      case "providers":
        return { value: t("dashboard.valueActive", { count: stats.providerCount }) };
      case "manual":
        return { value: t("dashboard.valueChapters", { count: stats.manualChapterCount }) };
      default:
        return { value: "—" };
    }
  };

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        helpHref="/manual/dashboard"
        actions={
          <>
            <Link href="/providers/new" className="btn-secondary">
              {t("dashboard.addProvider")}
            </Link>
            <Link href="/payments/new" className="btn-primary">
              {t("dashboard.createPayment")}
            </Link>
          </>
        }
      />

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`dash-${g.key}`}>
            <h2 id={`dash-${g.key}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t(`nav.groups.${g.key}` as MessageKey)}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t(`nav.groups.${g.key}` as MessageKey)}>
              {g.items.map((item) => {
                const f = figure(item);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="card group flex h-full items-start gap-4 p-5 transition hover:border-brand-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                        <Icon name={item.icon} className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900 group-hover:text-brand-700">{t(`nav.items.${item.key}` as MessageKey)}</span>
                          {f.badge && <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{f.badge}</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{t(`dashboard.cards.${item.key}` as MessageKey)}</span>
                        <span className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{f.value}</span>
                      </span>
                      <span className="self-center text-xs font-medium text-brand-700 opacity-0 transition group-hover:opacity-100" aria-hidden>
                        {t("dashboard.open")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
