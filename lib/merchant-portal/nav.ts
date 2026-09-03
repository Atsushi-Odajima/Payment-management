// Merchant portal navigation (Phase L-2). Client-safe.

import type { IconName } from "@/components/icons";

export interface MerchantNavItem {
  /** i18n key suffix: merchantPortal.nav.<key> */
  key: "dashboard" | "transactions" | "customers" | "refunds" | "webhooks" | "settlements" | "apiKeys" | "methods" | "announcements" | "sandbox";
  href: string;
  icon: IconName;
  exact?: boolean;
}

export const MERCHANT_NAV: readonly MerchantNavItem[] = [
  { key: "dashboard", href: "/merchant", icon: "home", exact: true },
  { key: "transactions", href: "/merchant/transactions", icon: "list" },
  { key: "customers", href: "/merchant/customers", icon: "users" },
  { key: "refunds", href: "/merchant/refunds", icon: "refund" },
  { key: "webhooks", href: "/merchant/webhooks", icon: "plug" },
  { key: "settlements", href: "/merchant/settlements", icon: "bank" },
  { key: "apiKeys", href: "/merchant/api-keys", icon: "key" },
  { key: "methods", href: "/merchant/methods", icon: "alert" },
  { key: "announcements", href: "/merchant/announcements", icon: "bell" },
  { key: "sandbox", href: "/merchant/sandbox", icon: "book" },
];
