"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Icon, type IconName } from "@/components/icons";
import { useT } from "@/components/language-provider";
import { formatYen } from "@/lib/utils";
import { MANUAL_CHAPTERS } from "@/lib/manual/chapters";

export interface DashboardViewProps {
  merchantCount: number;
  agentCount: number;
  todayPaymentCount: number;
  todayPaymentAmount: number;
  /** Transactions still expecting an outcome (pending / awaiting transfer / authorized). */
  openTransactionCount: number;
  /** Bank transfers past their deadline. */
  overdueTransferCount: number;
  activeIpRuleCount: number;
}

interface Card {
  key: string;
  href: string;
  icon: IconName;
  title: string;
  description: string;
  value: string;
  badge?: string;
}

export function DashboardView(props: DashboardViewProps) {
  const t = useT();

  const cards: Card[] = [
    {
      key: "merchants",
      href: "/merchants",
      icon: "store",
      title: t("dashboard.cards.merchants.title"),
      description: t("dashboard.cards.merchants.description"),
      value: t("dashboard.valueCount", { count: props.merchantCount }),
    },
    {
      key: "agents",
      href: "/agents",
      icon: "users",
      title: t("dashboard.cards.agents.title"),
      description: t("dashboard.cards.agents.description"),
      value: t("dashboard.valueCount", { count: props.agentCount }),
    },
    {
      key: "payments",
      href: "/payments",
      icon: "list",
      title: t("dashboard.cards.payments.title"),
      description: t("dashboard.cards.payments.description"),
      value: t("dashboard.valueToday", {
        count: props.todayPaymentCount,
        amount: formatYen(props.todayPaymentAmount),
      }),
    },
    {
      key: "applications",
      href: "/applications",
      icon: "inbox",
      title: t("dashboard.cards.applications.title"),
      description: t("dashboard.cards.applications.description"),
      value: t("dashboard.valueOpen", { count: props.openTransactionCount }),
      badge: props.overdueTransferCount > 0 ? t("dashboard.overdueBadge", { count: props.overdueTransferCount }) : undefined,
    },
    {
      key: "ip",
      href: "/ip-restrictions",
      icon: "shield",
      title: t("dashboard.cards.ipRestrictions.title"),
      description: t("dashboard.cards.ipRestrictions.description"),
      value: t("dashboard.valueRules", { count: props.activeIpRuleCount }),
    },
    {
      key: "manual",
      href: "/manual",
      icon: "book",
      title: t("dashboard.cards.manual.title"),
      description: t("dashboard.cards.manual.description"),
      value: t("dashboard.valueChapters", { count: MANUAL_CHAPTERS.length }),
    },
  ];

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

      <ul className="grid gap-4 sm:grid-cols-2" aria-label={t("dashboard.title")}>
        {cards.map((c) => (
          <li key={c.key}>
            <Link
              href={c.href}
              className="card group flex h-full items-start gap-4 p-5 transition hover:border-brand-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Icon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-slate-900 group-hover:text-brand-700">
                    {c.title}
                  </span>
                  {c.badge && (
                    <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{c.badge}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{c.description}</span>
                <span className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {c.value}
                </span>
              </span>
              <span className="self-center text-xs font-medium text-brand-700 opacity-0 transition group-hover:opacity-100" aria-hidden>
                {t("dashboard.open")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
