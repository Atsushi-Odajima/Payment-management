// Navigation model shared by the sidebar, the mobile tab bar and the
// dashboard cards. Items of phases that are not implemented yet are defined
// here already (so labels, routes and icons are fixed) but hidden until
// `implemented` is true.

import type { IconName } from "@/components/icons";

export type NavGroupKey = "transactions" | "merchants" | "settlement" | "risk" | "reports" | "notices" | "settings";

export interface NavItem {
  /** i18n key suffix: nav.items.<key> */
  key: string;
  href: string;
  icon: IconName;
  implemented: boolean;
  /** Master-only screen (hidden for the general role). */
  masterOnly?: boolean;
  /** Manual chapter shown from the dashboard card. */
  manual?: string;
}

export interface NavGroup {
  key: NavGroupKey;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "transactions",
    items: [
      { key: "applications", href: "/applications", icon: "inbox", implemented: true },
      { key: "payments", href: "/payments", icon: "list", implemented: true },
      { key: "refunds", href: "/refunds", icon: "refund", implemented: true },
      { key: "depositDiffs", href: "/deposit-diffs", icon: "bank", implemented: true },
    ],
  },
  {
    key: "merchants",
    items: [
      { key: "merchants", href: "/merchants", icon: "store", implemented: true },
      { key: "agents", href: "/agents", icon: "users", implemented: true },
      { key: "paymentLinks", href: "/payment-links", icon: "link", implemented: false },
      { key: "subscriptions", href: "/subscriptions", icon: "repeat", implemented: false },
    ],
  },
  {
    key: "settlement",
    items: [
      { key: "settlements", href: "/settlements", icon: "bank", implemented: true },
      { key: "agentFees", href: "/agent-fees", icon: "chart", implemented: false },
    ],
  },
  {
    key: "risk",
    items: [
      { key: "chargebacks", href: "/chargebacks", icon: "alert", implemented: true },
      { key: "blacklist", href: "/blacklist", icon: "shield", implemented: true },
    ],
  },
  {
    key: "reports",
    items: [
      { key: "reports", href: "/reports", icon: "chart", implemented: true },
      { key: "webhookLogs", href: "/webhook-logs", icon: "plug", implemented: true },
      { key: "emailLogs", href: "/email-logs", icon: "mail", implemented: true },
    ],
  },
  {
    key: "notices",
    items: [
      { key: "announcements", href: "/announcements", icon: "bell", implemented: true },
      { key: "emailTemplates", href: "/email-templates", icon: "mail", implemented: true },
    ],
  },
  {
    key: "settings",
    items: [
      { key: "admins", href: "/admins", icon: "user", implemented: true, masterOnly: true },
      { key: "ipRestrictions", href: "/ip-restrictions", icon: "shield", implemented: true },
      { key: "auditLogs", href: "/audit-logs", icon: "clipboard", implemented: true },
      { key: "providers", href: "/providers", icon: "plug", implemented: true },
      { key: "manual", href: "/manual", icon: "book", implemented: true },
    ],
  },
];

/** Groups with only the implemented items, filtered by role. */
export function visibleNavGroups(isMaster: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    key: g.key,
    items: g.items.filter((i) => i.implemented && (!i.masterOnly || isMaster)),
  })).filter((g) => g.items.length > 0);
}

/** Mobile bottom tabs (five slots). */
export const MOBILE_TABS: readonly { key: string; href: string; icon: IconName; exact?: boolean }[] = [
  { key: "dashboard", href: "/", icon: "home", exact: true },
  { key: "applications", href: "/applications", icon: "inbox" },
  { key: "payments", href: "/payments", icon: "list" },
  { key: "merchants", href: "/merchants", icon: "store" },
  { key: "manual", href: "/manual", icon: "book" },
];
