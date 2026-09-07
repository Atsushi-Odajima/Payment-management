// Translation-key checks (Phase P5), run by `npm run check:i18n` after the
// Japanese-text scan:
//
//   1. the ja and en catalogs have exactly the same leaf keys
//   2. every literal key passed to t("…") / translate(lang, "…") exists
//   3. every template key t(`prefix.${x}`) has `prefix` as an object in the catalog
//   4. every value of the enumerations that are rendered through the catalog
//      (nav items, merchant tabs, statuses, audit actions, …) resolves to a key
//
// A missing key is what makes the UI show "merchantTabs.methods" literally
// (t() falls back to the key), so this is the guard against leaked keys.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ja } from "../lib/i18n/messages/ja";
import { en } from "../lib/i18n/messages/en";
import { NAV_GROUPS, MOBILE_TABS } from "../lib/nav";
import { MERCHANT_NAV } from "../lib/merchant-portal/nav";
import { MERCHANT_TABS } from "../lib/merchants/tabs";
import { PAYMENT_STATUSES, PAYMENT_ACTIONS } from "../lib/payments/transitions";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, AUDIT_ACTOR_TYPES } from "../lib/audit";
import { NOTIFICATION_KINDS, NOTIFICATION_SEVERITIES } from "../lib/notifications/types";
import { EMAIL_TEMPLATE_KEYS, EMAIL_PLACEHOLDERS, EMAIL_LOG_STATUSES } from "../lib/email/templates";
import { PERMISSIONS } from "../lib/role";
import { WEBHOOK_STATUSES } from "../lib/webhooks/status";
import { SETTLEMENT_STATUSES, LINE_KINDS, TAX_CATEGORIES } from "../lib/settlements/types";
import { REFUND_REASONS, REFUND_STATUSES, REFUND_KINDS } from "../lib/refunds/types";
import { CHARGEBACK_REASONS, CHARGEBACK_STATUSES } from "../lib/chargebacks/types";
import { BLACKLIST_KINDS, BLACKLIST_SOURCES, BLACKLIST_STATUSES } from "../lib/risk/types";
import { DEPOSIT_DIFF_STATUSES } from "../lib/risk/deposit-diff-types";
import { UNMATCHED_DEPOSIT_STATUSES, UNMATCHED_DEPOSIT_SOURCES, UNMATCHED_DEPOSIT_REASONS, DISMISS_KINDS } from "../lib/deposits/types";
import { DEPOSIT_NOTIFICATION_SOURCES, DEPOSIT_NOTIFICATION_RESULTS, DEPOSIT_NOTIFICATION_REASONS } from "../lib/deposits/notification-types";
import { ANNOUNCEMENT_KINDS } from "../lib/announcements/types";
import { CVS_BRANDS } from "../lib/payments/konbini";
import { IP_TARGETS, IP_MODES } from "../lib/ip-restrictions/types";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];

function leaves(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

function lookup(node: unknown, key: string): unknown {
  let cur = node;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function* walk(path: string): Generator<string> {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(join(path, name));
    }
  } else if (/\.(ts|tsx|mts)$/.test(path) && !/\.test\./.test(path)) {
    yield path;
  }
}

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

// 1. Key parity.
const jaKeys = new Set(leaves(ja));
const enKeys = new Set(leaves(en));
for (const k of jaKeys) if (!enKeys.has(k)) fail(`en.ts is missing "${k}"`);
for (const k of enKeys) if (!jaKeys.has(k)) fail(`ja.ts has no "${k}" (extra key in en.ts)`);

// 2 / 3. Keys referenced from code.
const literalRe = /\b(?:t|translate|tOr)\(\s*(?:lang\s*,\s*)?"([a-zA-Z0-9_.]+)"/g;
const templateRe = /\b(?:t|translate)\(\s*(?:lang\s*,\s*)?`([a-zA-Z0-9_.]+)\.\$\{/g;
const files = SCAN_DIRS.flatMap((d) => [...walk(join(ROOT, d))]);
for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel.startsWith("lib/i18n/messages/")) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(literalRe)) {
    const key = m[1];
    if (!key.includes(".")) continue;
    if (!jaKeys.has(key)) fail(`${rel}: unknown key "${key}"`);
  }
  for (const m of src.matchAll(templateRe)) {
    const prefix = m[1];
    const node = lookup(ja, prefix);
    if (!node || typeof node !== "object") fail(`${rel}: template prefix "${prefix}" is not an object in ja.ts`);
  }
}

// 4. Enumerations rendered through the catalog.
const expectKeys = (label: string, prefix: string, values: readonly string[], transform: (v: string) => string = (v) => v) => {
  for (const v of values) {
    const key = `${prefix}.${transform(v)}`;
    if (!jaKeys.has(key)) fail(`${label}: missing "${key}"`);
  }
};
const dots = (v: string) => v.replace(/\./g, "_");
expectKeys("NAV_GROUPS (groups)", "nav.groups", NAV_GROUPS.map((g) => g.key));
expectKeys("NAV_GROUPS (items)", "nav.items", NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
expectKeys("NAV_GROUPS (dashboard cards)", "dashboard.cards", NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.implemented).map((i) => i.key)));
expectKeys("MOBILE_TABS", "nav.tabs", MOBILE_TABS.map((t) => t.key));
expectKeys("MERCHANT_NAV", "merchantPortal.nav", MERCHANT_NAV.map((i) => i.key));
expectKeys("MERCHANT_TABS", "merchantTabs", MERCHANT_TABS);
expectKeys("PAYMENT_STATUSES", "status", PAYMENT_STATUSES);
expectKeys("PAYMENT_ACTIONS (audit)", "auditEnums.action", PAYMENT_ACTIONS, (a) => `payment_${a}`);
expectKeys("AUDIT_ACTIONS", "auditEnums.action", AUDIT_ACTIONS, dots);
expectKeys("AUDIT_TARGET_TYPES", "auditEnums.targetType", AUDIT_TARGET_TYPES);
expectKeys("AUDIT_ACTOR_TYPES", "auditEnums.actorType", AUDIT_ACTOR_TYPES);
expectKeys("NOTIFICATION_KINDS", "notificationEnums.kind", NOTIFICATION_KINDS, dots);
expectKeys("NOTIFICATION_KINDS (help)", "notificationEnums.kindHelp", NOTIFICATION_KINDS, dots);
expectKeys("NOTIFICATION_SEVERITIES", "notificationEnums.severity", NOTIFICATION_SEVERITIES);
expectKeys("EMAIL_TEMPLATE_KEYS", "emailEnums.key", EMAIL_TEMPLATE_KEYS);
expectKeys("EMAIL_PLACEHOLDERS", "emailEnums.placeholder", EMAIL_PLACEHOLDERS);
expectKeys("EMAIL_LOG_STATUSES", "emailEnums.status", EMAIL_LOG_STATUSES);
expectKeys("PERMISSIONS (resources)", "permissions.resource", Object.keys(PERMISSIONS));
expectKeys("PERMISSIONS (actions)", "permissions.action", [...new Set(Object.values(PERMISSIONS).flatMap((r) => Object.keys(r)))]);
expectKeys("WEBHOOK_STATUSES", "webhookEnums.status", WEBHOOK_STATUSES);
expectKeys("SETTLEMENT_STATUSES", "settlementEnums.status", SETTLEMENT_STATUSES);
expectKeys("LINE_KINDS", "settlementEnums.lineKind", LINE_KINDS);
expectKeys("TAX_CATEGORIES", "settlementEnums.taxCategory", TAX_CATEGORIES);
expectKeys("REFUND_REASONS", "refundEnums.reason", REFUND_REASONS);
expectKeys("REFUND_STATUSES", "refundEnums.status", REFUND_STATUSES);
expectKeys("REFUND_KINDS", "refundEnums.kind", REFUND_KINDS);
expectKeys("CHARGEBACK_REASONS", "chargebackEnums.reason", CHARGEBACK_REASONS);
expectKeys("CHARGEBACK_STATUSES", "chargebackEnums.status", CHARGEBACK_STATUSES);
expectKeys("BLACKLIST_KINDS", "blacklistEnums.kind", BLACKLIST_KINDS);
expectKeys("BLACKLIST_SOURCES", "blacklistEnums.source", BLACKLIST_SOURCES);
expectKeys("BLACKLIST_STATUSES", "blacklistEnums.status", BLACKLIST_STATUSES);
expectKeys("DEPOSIT_DIFF_STATUSES", "depositDiffEnums.status", DEPOSIT_DIFF_STATUSES);
expectKeys("UNMATCHED_DEPOSIT_STATUSES", "unmatchedDepositEnums.status", UNMATCHED_DEPOSIT_STATUSES);
expectKeys("UNMATCHED_DEPOSIT_SOURCES", "unmatchedDepositEnums.source", UNMATCHED_DEPOSIT_SOURCES);
expectKeys("UNMATCHED_DEPOSIT_REASONS", "unmatchedDepositEnums.reason", UNMATCHED_DEPOSIT_REASONS);
expectKeys("DISMISS_KINDS", "unmatchedDepositEnums.dismissKind", DISMISS_KINDS);
expectKeys("DEPOSIT_NOTIFICATION_SOURCES", "depositNotificationEnums.source", DEPOSIT_NOTIFICATION_SOURCES);
expectKeys("DEPOSIT_NOTIFICATION_RESULTS", "depositNotificationEnums.result", DEPOSIT_NOTIFICATION_RESULTS);
expectKeys("DEPOSIT_NOTIFICATION_REASONS", "depositNotificationEnums.reason", DEPOSIT_NOTIFICATION_REASONS);
expectKeys("ANNOUNCEMENT_KINDS", "announcementEnums.kind", ANNOUNCEMENT_KINDS);
expectKeys("CVS_BRANDS", "cvsEnums.brand", CVS_BRANDS);
expectKeys("IP_TARGETS", "ipEnums.target", IP_TARGETS);
expectKeys("IP_MODES", "ipEnums.mode", IP_MODES);

if (failures.length > 0) {
  for (const f of failures) console.error(f);
  console.error(`\n✗ check:i18n-keys found ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`✓ check:i18n-keys: ${jaKeys.size} keys in both catalogs, every referenced key and enumeration value resolves.`);
