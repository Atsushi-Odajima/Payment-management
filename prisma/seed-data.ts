// Deterministic demo data.
//
// Idempotent per table: every record has a fixed id and is upserted with an
// empty `update`, so re-running (every Vercel build runs this) only fills in
// rows that are missing and never overwrites edits made through the UI.
//
// Demo copy (store names, customers, products) is intentionally Japanese:
// the product targets Japanese EC stores. UI labels are translated; data is not.

import type { PrismaClient } from "@prisma/client";
import { buildCredentialStore } from "../lib/providers/credentials";
import { encryptMerchantPassword } from "../lib/merchants/secrets";
import { transferDueDate } from "../lib/payments/transfer";
import { cvsDueDate } from "../lib/payments/konbini";
import { partsInTz } from "../lib/settlements/schedule";
import { linkExistingPayments } from "../lib/customers/service";
import { runPhase1Backfill } from "../lib/maintenance/phase1-backfill";
import { cardFingerprint } from "../lib/risk/service";
import { hashPassword } from "../lib/admin/password";
import { PLAN_DEFAULT_RATES } from "../lib/merchants/fees";
import { displayPrefix } from "../lib/merchants/api-keys";
import { hashApiKey } from "../lib/merchants/api-keys-server";
import { encryptSigningSecret } from "../lib/merchants/secrets";
import { DEFAULT_EMAIL_TEMPLATES } from "../lib/email/templates";
import { DEMO_ADMIN_ACCOUNTS, DEMO_ADMIN_PASSWORD_CONFIGURED, hiddenDemoPassword } from "./seed-accounts";

export const SEED_IDS = {
  stripeProvider: "prov_stripe_demo",
  paypayProvider: "prov_paypay_demo",
  bankProvider: "prov_bank_demo",
  payment1: "pay_demo_001",
  payment2: "pay_demo_002",
  payment3: "pay_demo_003",
  payment4: "pay_demo_004",
  payment5: "pay_demo_005",
  payment6: "pay_demo_006",
  payment7: "pay_demo_007",
  payment8: "pay_demo_008",
  payment9: "pay_demo_009",
  merchant1: "mer_demo_001",
  merchant2: "mer_demo_002",
  merchant3: "mer_demo_003",
  agent1: "agt_demo_001",
  agent2: "agt_demo_002",
  ip1: "ip_demo_001",
  ip2: "ip_demo_002",
  ip3: "ip_demo_003",
  ip4: "ip_demo_004",
  adminMaster: DEMO_ADMIN_ACCOUNTS.admin.id,
  adminGeneral: DEMO_ADMIN_ACCOUNTS.cs.id,
  audit1: "aud_demo_001",
  audit2: "aud_demo_002",
  audit3: "aud_demo_003",
  fee1: "fee_demo_001",
  fee2: "fee_demo_002",
  fee3: "fee_demo_003",
  fee4: "fee_demo_004",
  apiKey1: "key_demo_001",
  apiKey2: "key_demo_002",
  apiKey3: "key_demo_003",
  apiKey4: "key_demo_004",
  apiKey5: "key_demo_005",
  apiKey6: "key_demo_006",
  apiKey7: "key_demo_007",
  apiKey8: "key_demo_008",
  apiKey9: "key_demo_009",
  refund1: "ref_demo_001",
  refund2: "ref_demo_002",
  settlement1: "stl_demo_001",
  settlement2: "stl_demo_002",
  webhook1: "whd_demo_001",
  webhook2: "whd_demo_002",
  webhook3: "whd_demo_003",
  payment10: "pay_demo_010",
  payment11: "pay_demo_011",
  payment16: "pay_demo_016",
  payment17: "pay_demo_017",
  payment18: "pay_demo_018",
  chargeback1: "cb_demo_001",
  blacklist1: "bl_demo_001",
  blacklist2: "bl_demo_002",
  email1: "eml_demo_001",
  email2: "eml_demo_002",
  announcement1: "ann_demo_001",
  announcement2: "ann_demo_002",
  plan1: "plan_demo_001",
  plan2: "plan_demo_002",
  subscription1: "sub_demo_001",
  subscription2: "sub_demo_002",
  paymentLink1: "plk_demo_001",
  paymentLink2: "plk_demo_002",
  payment12: "pay_demo_012",
  payment13: "pay_demo_013",
  unmatched1: "und_demo_001",
  unmatched2: "und_demo_002",
  unmatched3: "und_demo_003",
  depositNotification1: "dpn_demo_001",
  depositNotification2: "dpn_demo_002",
  depositNotification3: "dpn_demo_003",
  depositNotification4: "dpn_demo_004",
  note1: "note_demo_001",
  note2: "note_demo_002",
  methodControl1: "pmc_demo_001",
  notification1: "ntf_demo_001",
  notification2: "ntf_demo_002",
  notification3: "ntf_demo_003",
  cvsProvider: "prov_cvs_demo",
  payment14: "pay_demo_014",
  payment15: "pay_demo_015",
  receipt1: "rcp_demo_001",
  customerAnonymized: "cus_demo_anon",
  anonymizeBatch1: "anb_demo_001",
} as const;

/** Fixed konbini receipt numbers of the seeded slips (Phase K-1). */
export const SEED_CVS_RECEIPT_NOS = {
  [SEED_IDS.payment14]: "4102993827716", // pending, merchant3
  [SEED_IDS.payment15]: "5583017740219", // paid, merchant3
} as const;

/** Fixed token of the seeded payment link (the hosted page is /pay/<token>). */
export const SEED_PAYMENT_LINK_TOKEN = "kotoridemolinktoken00001";

/**
 * Fixed plaintext API keys of the demo merchants (only the SHA-256 hash is
 * stored; these are exported so tests and the manual can call the merchant API).
 */
export const SEED_API_KEYS = {
  [SEED_IDS.apiKey1]: "wp_test_ak_KotoriDemoTestKey000000000000001", // merchant1, active
  [SEED_IDS.apiKey2]: "wp_live_ak_KotoriDemoLiveKey000000000000002", // merchant1, active
  [SEED_IDS.apiKey3]: "wp_test_ss_KotoriDemoSigning000000000000003", // merchant1, signing secret
  [SEED_IDS.apiKey4]: "wp_test_ak_SakuraDemoRevoked000000000000004", // merchant2, revoked
  // Signing secrets for every merchant × mode (Phase P1-4: webhooks are never signed with the password).
  [SEED_IDS.apiKey5]: "wp_live_ss_KotoriDemoSigningLive0000000005", // merchant1, live
  [SEED_IDS.apiKey6]: "wp_test_ss_SakuraDemoSigning000000000006", // merchant2, test
  [SEED_IDS.apiKey7]: "wp_live_ss_SakuraDemoSigningLive0000000007", // merchant2, live
  [SEED_IDS.apiKey8]: "wp_test_ss_TsukijiDemoSigning00000000008", // merchant3, test
  [SEED_IDS.apiKey9]: "wp_live_ss_TsukijiDemoSigningLive000000009", // merchant3, live
} as const;

/**
 * Demo merchant passwords. MER-00001 is the merchant demo account listed on
 * the login pages (加盟店デモアカウント) and keeps a fixed password; the other
 * seeded merchants get a random password on the public demo (production) so
 * only the listed account can be used by visitors — an admin can still reveal
 * them on the merchant detail. Outside production all are fixed so the
 * admin-role reveal is reproducible in tests.
 */
export const SEED_MERCHANT_PASSWORDS = {
  [SEED_IDS.merchant1]: "Kotori2026Demo",
  [SEED_IDS.merchant2]: hiddenDemoPassword("Sakura2026Demo"),
  [SEED_IDS.merchant3]: hiddenDemoPassword("Tsukiji2026Demo"),
} as const;

/** The merchant demo account shown on the login pages. */
export const DEMO_PUBLIC_MERCHANT = { id: SEED_IDS.merchant1, password: SEED_MERCHANT_PASSWORDS[SEED_IDS.merchant1] } as const;

/** Fixed bank-transfer ids of the seeded transfers (used by tests and the manual). */
export const SEED_TRANSFER_IDS = {
  [SEED_IDS.payment4]: "48213907", // merchant2 issues 8-digit ids
  [SEED_IDS.payment5]: "7301256", // merchant3 issues 7-digit ids
  [SEED_IDS.payment7]: "5120983",
  [SEED_IDS.payment9]: "6642019",
  [SEED_IDS.payment10]: "7788120",
  [SEED_IDS.payment11]: "7788121",
  [SEED_IDS.payment16]: "7455102", // expired transfer whose deposit arrived late (Phase P1-3)
  [SEED_IDS.payment17]: "48219034", // merchant2 (8 digits), short deposit in test mode (Phase P5)
  [SEED_IDS.payment18]: "48219035", // merchant2 (8 digits), excess deposit in test mode (Phase P5)
} as const;

export interface SeedOptions {
  /** Reference "now" for relative timestamps (defaults to real time). */
  now?: Date;
}

export interface SeedSummary {
  providers: number;
  payments: number;
  merchants: number;
  agents: number;
  ipRestrictions: number;
  admins: number;
  auditLogs: number;
  feeSchedules: number;
  limits: number;
  apiKeys: number;
}

type EventSeed = { type: string; fromStatus: string | null; toStatus: string; amount: number; actor: string; createdAt: Date };

export async function seed(prisma: PrismaClient, opts: SeedOptions = {}): Promise<SeedSummary> {
  const now = opts.now ?? new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysAgo = (d: number) => hoursAgo(24 * d);

  // ── Providers ─────────────────────────────────────────────────────────
  const stripe = await prisma.paymentProvider.upsert({
    where: { id: SEED_IDS.stripeProvider },
    update: {},
    create: {
      id: SEED_IDS.stripeProvider,
      providerKey: "stripe",
      category: "credit",
      displayName: "本店 (Stripe)",
      testMode: true,
      credentials: JSON.stringify(
        buildCredentialStore("stripe", {
          publishable_key: "pk_test_seedDemoPublishableKey1234",
          secret_key: "sk_test_seedDemoSecretKey5678abcd",
          webhook_secret: "whsec_seedDemoWebhookSecret",
          statement_descriptor: "MYSTORE",
        }),
      ),
    },
  });
  const paypay = await prisma.paymentProvider.upsert({
    where: { id: SEED_IDS.paypayProvider },
    update: {},
    create: {
      id: SEED_IDS.paypayProvider,
      providerKey: "paypay",
      category: "qr",
      displayName: "本店 (PayPay)",
      testMode: true,
      credentials: JSON.stringify(
        buildCredentialStore("paypay", {
          merchant_id: "M-SEED-0001",
          api_key: "API_KEY_SEED",
          api_secret: "SECRET_SEED_VALUE",
        }),
      ),
    },
  });
  const bank = await prisma.paymentProvider.upsert({
    where: { id: SEED_IDS.bankProvider },
    update: {},
    create: {
      id: SEED_IDS.bankProvider,
      providerKey: "virtual_account",
      category: "bank",
      displayName: "本店 (バーチャル口座)",
      testMode: true,
      credentials: JSON.stringify(
        buildCredentialStore("virtual_account", {
          bank_partner: "gmo_aozora",
          api_user: "wirepay_demo",
          api_password: "VA_SEED_PASSWORD",
          branch_code: "101",
        }),
      ),
    },
  });

  // Konbini provider (Phase K-1): offered to merchant3's customers.
  const cvs = await prisma.paymentProvider.upsert({
    where: { id: SEED_IDS.cvsProvider },
    update: {},
    create: {
      id: SEED_IDS.cvsProvider,
      providerKey: "web_conveni",
      category: "convenience",
      displayName: "本店 (コンビニ決済)",
      testMode: true,
      credentials: JSON.stringify(
        buildCredentialStore("web_conveni", {
          contract_code: "WC-SEED-0001",
          api_token: "WC_SEED_TOKEN_0001",
          stores: "seven,lawson,familymart,ministop",
        }),
      ),
    },
  });

  // ── Agents ────────────────────────────────────────────────────────────
  const agents = [
    {
      id: SEED_IDS.agent1,
      agentCode: "AGT-00001",
      name: "ECサポートパートナーズ",
      nameKana: "イーシーサポートパートナーズ",
      companyName: "株式会社ECサポートパートナーズ",
      contactName: "高橋 誠",
      email: "partner@ec-support.example.jp",
      feeRate: 3.5,
      status: "active",
      createdAt: daysAgo(60),
    },
    {
      id: SEED_IDS.agent2,
      agentCode: "AGT-00002",
      name: "関西ネット商事",
      nameKana: "カンサイネットショウジ",
      companyName: "関西ネット商事株式会社",
      contactName: "中村 恵",
      email: "sales@kansai-net.example.jp",
      feeRate: 2.0,
      status: "active",
      createdAt: daysAgo(30),
    },
  ];
  for (const a of agents) {
    await prisma.agent.upsert({ where: { id: a.id }, update: {}, create: a });
  }

  // ── Merchants ─────────────────────────────────────────────────────────
  const merchants = [
    {
      id: SEED_IDS.merchant1,
      merchantCode: "MER-00001",
      siteName: "ハンドメイド雑貨 コトリ",
      siteNameKana: "ハンドメイドザッカ コトリ",
      companyName: "株式会社コトリ",
      contactName: "小鳥 遊",
      email: "info@kotori.example.jp",
      statementEmail: "billing@kotori.example.jp",
      notifyUrl: "/api/demo/webhook-receiver?result=ok",
      notifyFormat: "json_post",
      notifyParamSet: "standard",
      notifyIdFormat: "payment_id",
      emailNotification: "per_payment",
      agentId: SEED_IDS.agent1,
      enabledMethods: JSON.stringify(["credit", "qr"]),
      transferIdDigits: 7,
      invoiceNumber: "T1234567890123",
      address: "東京都渋谷区神宮前 1-2-3 コトリビル 4F",
      settlementCycle: "monthly",
      payoutTerm: "next_month_end",
      bankName: "デモ銀行",
      bankBranch: "本店営業部",
      bankAccountType: "ordinary",
      bankAccountNumber: "1234567",
      bankAccountHolder: "カ）コトリ",
      settlementFee: 330,
      createdAt: daysAgo(40),
    },
    {
      id: SEED_IDS.merchant2,
      merchantCode: "MER-00002",
      siteName: "サクラ茶舗 オンラインストア",
      siteNameKana: "サクラチャホ オンラインストア",
      companyName: "有限会社桜茶舗",
      contactName: "佐倉 花",
      email: "shop@sakura-cha.example.jp",
      statementEmail: "shop@sakura-cha.example.jp",
      notifyUrl: "/api/demo/webhook-receiver?result=error",
      notifyFormat: "form_post",
      notifyParamSet: "full",
      notifyIdFormat: "both",
      emailNotification: "daily",
      agentId: SEED_IDS.agent2,
      enabledMethods: JSON.stringify(["credit", "bank"]),
      transferIdDigits: 8,
      createdAt: daysAgo(12),
    },
    {
      id: SEED_IDS.merchant3,
      merchantCode: "MER-00003",
      siteName: "築地まぐろ直送便",
      siteNameKana: "ツキジマグロチョクソウビン",
      companyName: "築地水産株式会社",
      contactName: "築地 太郎",
      email: "order@tsukiji-maguro.example.jp",
      statementEmail: "accounting@tsukiji-maguro.example.jp",
      notifyUrl: "/api/demo/webhook-receiver?result=ok",
      notifyFormat: "query_get",
      notifyParamSet: "minimal",
      notifyIdFormat: "transaction_id",
      emailNotification: "none",
      agentId: null,
      enabledMethods: JSON.stringify(["bank", "convenience"]),
      transferIdDigits: 7,
      cvsDueDays: 3,
      address: "東京都中央区築地 5-6-7",
      createdAt: daysAgo(20),
    },
  ] as const;
  for (const m of merchants) {
    await prisma.merchant.upsert({
      where: { id: m.id },
      update: {},
      create: { ...m, passwordEnc: encryptMerchantPassword(SEED_MERCHANT_PASSWORDS[m.id]) },
    });
  }

  // ── Transactions (決済申請 / 決済) ─────────────────────────────────────
  // 3 completed, 1 authorized, 2 awaiting transfer (one overdue), 1 failed.
  const ev = (type: string, from: string | null, to: string, amount: number, actor: string, at: Date): EventSeed => ({
    type,
    fromStatus: from,
    toStatus: to,
    amount,
    actor,
    createdAt: at,
  });
  const payments = [
    {
      id: SEED_IDS.payment1,
      providerId: stripe.id,
      merchantId: SEED_IDS.merchant1,
      method: "credit",
      orderNumber: "ORD-DEMO-001",
      productName: "春物ジャケット",
      amount: 4980,
      status: "captured",
      externalId: "stripe_demo_001",
      customerName: "山田 太郎",
      customerId: "u_10021",
      customerEmail: "taro@example.com",
      description: "春物ジャケット x 1",
      createdAt: hoursAgo(6),
      capturedAt: hoursAgo(6),
      events: [ev("created", null, "authorized", 4980, "seed", hoursAgo(6)), ev("capture", "authorized", "captured", 4980, "seed", hoursAgo(6))],
    },
    {
      id: SEED_IDS.payment2,
      providerId: paypay.id,
      merchantId: SEED_IDS.merchant1,
      method: "qr",
      orderNumber: "ORD-DEMO-002",
      productName: "ロゴTシャツ",
      amount: 1280,
      status: "captured",
      externalId: "paypay_demo_002",
      customerName: "鈴木 花子",
      customerId: "u_10388",
      description: "ロゴTシャツ x 1",
      createdAt: hoursAgo(3),
      capturedAt: hoursAgo(3),
      events: [ev("created", null, "authorized", 1280, "seed", hoursAgo(3)), ev("capture", "authorized", "captured", 1280, "seed", hoursAgo(3))],
    },
    {
      id: SEED_IDS.payment3,
      providerId: stripe.id,
      merchantId: SEED_IDS.merchant2,
      method: "credit",
      orderNumber: "ORD-DEMO-003",
      productName: "ハンドメイドバッグ",
      amount: 9800,
      status: "authorized",
      externalId: "stripe_demo_003",
      customerName: "佐藤 次郎",
      customerId: "u_20417",
      description: "ハンドメイドバッグ x 1",
      createdAt: hoursAgo(1),
      events: [ev("created", null, "authorized", 9800, "seed", hoursAgo(1))],
    },
    {
      id: SEED_IDS.payment4,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant2,
      method: "bank",
      orderNumber: "ORD-DEMO-004",
      productName: "抹茶ギフトセット",
      amount: 24800,
      status: "awaiting_transfer",
      externalId: "va_demo_004",
      customerName: "高橋 由美",
      customerId: "u_20533",
      description: "抹茶ギフトセット x 2",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment4],
      transferDueAt: transferDueDate(daysAgo(4)),
      createdAt: daysAgo(4),
      events: [ev("created", null, "awaiting_transfer", 24800, "seed", daysAgo(4))],
    },
    {
      id: SEED_IDS.payment5,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-DEMO-005",
      productName: "本まぐろ中トロ 500g",
      amount: 6600,
      status: "awaiting_transfer",
      externalId: "va_demo_005",
      customerName: "渡辺 健",
      customerId: "u_30102",
      description: "本まぐろ中トロ 500g x 1",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment5],
      transferDueAt: transferDueDate(daysAgo(9)), // overdue by 2 days
      createdAt: daysAgo(9),
      events: [ev("created", null, "awaiting_transfer", 6600, "seed", daysAgo(9))],
    },
    {
      id: SEED_IDS.payment6,
      providerId: stripe.id,
      merchantId: SEED_IDS.merchant2,
      method: "credit",
      orderNumber: "ORD-DEMO-006",
      productName: "茶器セット",
      amount: 15800,
      status: "failed",
      externalId: "stripe_demo_006",
      customerName: "田中 一郎",
      customerId: "u_20690",
      description: "茶器セット x 1",
      createdAt: daysAgo(2),
      events: [ev("created", null, "pending", 15800, "seed", daysAgo(2)), ev("fail", "pending", "failed", 15800, "webhook", daysAgo(2))],
    },
    {
      id: SEED_IDS.payment7,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-DEMO-007",
      productName: "本まぐろ赤身 1kg",
      amount: 12000,
      status: "captured",
      externalId: "va_demo_007",
      customerName: "伊藤 美咲",
      customerId: "u_30077",
      description: "本まぐろ赤身 1kg x 1",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7],
      transferDueAt: transferDueDate(daysAgo(5)),
      depositAmount: 12000,
      createdAt: daysAgo(5),
      capturedAt: daysAgo(1),
      events: [ev("created", null, "awaiting_transfer", 12000, "seed", daysAgo(5)), ev("deposit", "awaiting_transfer", "captured", 12000, "bank", daysAgo(1))],
    },
    // Live-mode rows so the header's test / live switch shows a difference.
    {
      id: SEED_IDS.payment8,
      providerId: stripe.id,
      merchantId: SEED_IDS.merchant1,
      method: "credit",
      orderNumber: "ORD-LIVE-001",
      productName: "刺繍ブローチ",
      amount: 3200,
      status: "captured",
      externalId: "stripe_live_001",
      customerName: "中村 花",
      customerId: "u_10488",
      description: "刺繍ブローチ x 1",
      livemode: true,
      createdAt: daysAgo(3),
      capturedAt: daysAgo(3),
      events: [ev("created", null, "authorized", 3200, "seed", daysAgo(3)), ev("capture", "authorized", "captured", 3200, "webhook", daysAgo(3))],
    },
    {
      id: SEED_IDS.payment9,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-LIVE-002",
      productName: "干物詰め合わせ",
      amount: 6800,
      status: "awaiting_transfer",
      externalId: "va_live_002",
      customerName: "小林 健",
      customerId: "u_30512",
      description: "干物詰め合わせ x 1",
      livemode: true,
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment9],
      transferDueAt: transferDueDate(daysAgo(1)),
      createdAt: daysAgo(1),
      events: [ev("created", null, "awaiting_transfer", 6800, "seed", daysAgo(1))],
    },
    // Deposit differences (Phase F-3, live mode): a short deposit still awaiting
    // the balance and an excess deposit that completed the transaction.
    {
      id: SEED_IDS.payment10,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-LIVE-003",
      productName: "海鮮丼セット",
      amount: 9800,
      status: "awaiting_transfer",
      externalId: "va_live_003",
      customerName: "斎藤 由美",
      customerId: "u_30640",
      customerEmail: "yumi@example.com",
      description: "海鮮丼セット x 2",
      livemode: true,
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment10],
      transferDueAt: transferDueDate(daysAgo(2)),
      depositAmount: 8800,
      depositDiff: "short",
      depositDiffStatus: "open",
      createdAt: daysAgo(2),
      events: [ev("created", null, "awaiting_transfer", 9800, "seed", daysAgo(2)), ev("deposit", "awaiting_transfer", "awaiting_transfer", 8800, "bank", daysAgo(1))],
    },
    {
      id: SEED_IDS.payment11,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-LIVE-004",
      productName: "本まぐろ中トロ 500g",
      amount: 7500,
      status: "captured",
      externalId: "va_live_004",
      customerName: "渡辺 大",
      customerId: "u_30655",
      customerEmail: "dai@example.com",
      description: "本まぐろ中トロ 500g x 1",
      livemode: true,
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment11],
      transferDueAt: transferDueDate(daysAgo(3)),
      depositAmount: 8000,
      depositDiff: "excess",
      depositDiffStatus: "open",
      createdAt: daysAgo(3),
      capturedAt: daysAgo(1),
      events: [ev("created", null, "awaiting_transfer", 7500, "seed", daysAgo(3)), ev("deposit", "awaiting_transfer", "captured", 8000, "bank", daysAgo(1))],
    },
  ];
  for (const { events, livemode, ...p } of payments as Array<(typeof payments)[number] & { livemode?: boolean }>) {
    await prisma.payment.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, livemode: livemode ?? false, events: { create: events } },
    });
  }

  // ── Contracts / fee schedules ─────────────────────────────────────────
  const customRates = { credit: { ratePercent: 3.4, fixedFee: 0 }, qr: { ratePercent: 2.8, fixedFee: 0 }, convenience: { ratePercent: 3.2, fixedFee: 30 }, bank: { ratePercent: 1.2, fixedFee: 40 } };
  const feeSchedules = [
    { id: SEED_IDS.fee1, merchantId: SEED_IDS.merchant1, plan: "standard", rates: JSON.stringify(PLAN_DEFAULT_RATES.standard), effectiveFrom: daysAgo(40), note: "契約開始", createdAt: daysAgo(40) },
    { id: SEED_IDS.fee2, merchantId: SEED_IDS.merchant2, plan: "standard", rates: JSON.stringify(PLAN_DEFAULT_RATES.standard), effectiveFrom: daysAgo(30), note: "契約開始", createdAt: daysAgo(30) },
    { id: SEED_IDS.fee3, merchantId: SEED_IDS.merchant2, plan: "premium", rates: JSON.stringify(PLAN_DEFAULT_RATES.premium), effectiveFrom: daysAgo(-14), note: "月間取扱高の増加によりプレミアムへ", createdAt: daysAgo(2) },
    { id: SEED_IDS.fee4, merchantId: SEED_IDS.merchant3, plan: "custom", rates: JSON.stringify(customRates), effectiveFrom: daysAgo(20), note: "銀行振込中心のため個別料率", createdAt: daysAgo(20) },
  ];
  for (const f of feeSchedules) {
    await prisma.merchantFeeSchedule.upsert({ where: { id: f.id }, update: {}, create: f });
  }

  // ── Limits ────────────────────────────────────────────────────────────
  const limits = [
    { merchantId: SEED_IDS.merchant1, method: "credit", perTransaction: 100_000, daily: 300_000, monthly: 3_000_000 },
    { merchantId: SEED_IDS.merchant1, method: "qr", perTransaction: null, daily: 200_000, monthly: null },
    { merchantId: SEED_IDS.merchant3, method: "bank", perTransaction: 500_000, daily: null, monthly: 5_000_000 },
  ];
  for (const l of limits) {
    await prisma.merchantLimit.upsert({ where: { merchantId_method: { merchantId: l.merchantId, method: l.method } }, update: {}, create: l });
  }

  // ── API keys ──────────────────────────────────────────────────────────
  const apiKeys = [
    { id: SEED_IDS.apiKey1, merchantId: SEED_IDS.merchant1, mode: "test", kind: "api_key", label: "開発環境", issuedAt: daysAgo(35), lastUsedAt: hoursAgo(6) },
    { id: SEED_IDS.apiKey2, merchantId: SEED_IDS.merchant1, mode: "live", kind: "api_key", label: "本番サーバー", issuedAt: daysAgo(30), lastUsedAt: daysAgo(3) },
    { id: SEED_IDS.apiKey3, merchantId: SEED_IDS.merchant1, mode: "test", kind: "signing_secret", label: "通知署名（開発）", issuedAt: daysAgo(35), lastUsedAt: null },
    { id: SEED_IDS.apiKey4, merchantId: SEED_IDS.merchant2, mode: "test", kind: "api_key", label: "旧キー", issuedAt: daysAgo(25), lastUsedAt: daysAgo(10), revokedAt: daysAgo(8) },
    { id: SEED_IDS.apiKey5, merchantId: SEED_IDS.merchant1, mode: "live", kind: "signing_secret", label: "通知署名（本番）", issuedAt: daysAgo(30), lastUsedAt: null },
    { id: SEED_IDS.apiKey6, merchantId: SEED_IDS.merchant2, mode: "test", kind: "signing_secret", label: "auto", issuedAt: daysAgo(40), lastUsedAt: null },
    { id: SEED_IDS.apiKey7, merchantId: SEED_IDS.merchant2, mode: "live", kind: "signing_secret", label: "通知署名（本番）", issuedAt: daysAgo(20), lastUsedAt: null },
    { id: SEED_IDS.apiKey8, merchantId: SEED_IDS.merchant3, mode: "test", kind: "signing_secret", label: "auto", issuedAt: daysAgo(15), lastUsedAt: null },
    { id: SEED_IDS.apiKey9, merchantId: SEED_IDS.merchant3, mode: "live", kind: "signing_secret", label: "通知署名（本番）", issuedAt: daysAgo(15), lastUsedAt: null },
  ];
  for (const k of apiKeys) {
    const plaintext = SEED_API_KEYS[k.id as keyof typeof SEED_API_KEYS];
    await prisma.apiKey.upsert({ where: { id: k.id }, update: {}, create: { ...k, keyPrefix: displayPrefix(plaintext), keyHash: hashApiKey(plaintext), secretEnc: k.kind === "signing_secret" ? encryptSigningSecret(plaintext) : null } });
  }

  // ── IP restrictions ───────────────────────────────────────────────────
  const ips = [
    { id: SEED_IDS.ip1, target: "admin", merchantId: null, cidr: "203.0.113.10", label: "本社オフィス (固定IP)", mode: "allow", enabled: true, createdAt: daysAgo(50) },
    { id: SEED_IDS.ip2, target: "admin", merchantId: null, cidr: "198.51.100.0/24", label: "運用センター VPN", mode: "allow", enabled: true, createdAt: daysAgo(45) },
    { id: SEED_IDS.ip3, target: "merchant_api", merchantId: SEED_IDS.merchant1, cidr: "192.0.2.0/28", label: "コトリ 本番サーバー", mode: "allow", enabled: false, createdAt: daysAgo(10) },
    { id: SEED_IDS.ip4, target: "admin", merchantId: null, cidr: "203.0.113.200", label: "不審なアクセス元 (ブロック)", mode: "deny", enabled: true, createdAt: daysAgo(3) },
  ];
  for (const r of ips) {
    await prisma.ipRestriction.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── Admin users ───────────────────────────────────────────────────────
  // Passwords are hashed with scrypt on every run; `update: {}` keeps a
  // password changed through the UI.
  // Phase I-1: legacy role names are migrated in place (idempotent), then one demo account per role is ensured.
  await prisma.adminUser.updateMany({ where: { role: "master" }, data: { role: "admin" } });
  await prisma.adminUser.updateMany({ where: { role: "general" }, data: { role: "cs" } });
  const admins = Object.values(DEMO_ADMIN_ACCOUNTS);
  if (process.env.NODE_ENV === "production" && !DEMO_ADMIN_PASSWORD_CONFIGURED) {
    console.warn("[seed] DEMO_ADMIN_PASSWORD is not set: the admin account gets a random password and nobody can log in as admin. Set DEMO_ADMIN_PASSWORD and re-run the seed (or reset the demo).");
  }
  for (const a of admins) {
    await prisma.adminUser.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        loginId: a.loginId,
        name: a.name,
        email: a.email,
        role: a.role,
        status: "active",
        passwordHash: hashPassword(a.password),
        createdAt: daysAgo(70),
      },
    });
  }

  // ── Refund requests (Phase C) ─────────────────────────────────────────
  // One pending request (for the master to review) and one rejected one;
  // neither touches the payment rows, which keeps the transaction seed stable.
  const refunds = [
    {
      id: SEED_IDS.refund1,
      paymentId: SEED_IDS.payment2,
      merchantId: SEED_IDS.merchant1,
      amount: 500,
      kind: "partial",
      reasonCode: "defect",
      reason: "プリントのかすれ（写真あり）",
      status: "requested",
      requestedById: DEMO_ADMIN_ACCOUNTS.cs.id,
      createdAt: hoursAgo(2),
    },
    {
      id: SEED_IDS.refund2,
      paymentId: SEED_IDS.payment1,
      merchantId: SEED_IDS.merchant1,
      amount: 4980,
      kind: "full",
      reasonCode: "customer",
      reason: "サイズ違いのため返品希望",
      status: "rejected",
      requestedById: DEMO_ADMIN_ACCOUNTS.cs.id,
      approvedById: DEMO_ADMIN_ACCOUNTS.admin.id,
      decisionNote: "返品受領前のため否認。商品到着後に再申請",
      createdAt: hoursAgo(5),
      completedAt: hoursAgo(4),
    },
  ];
  for (const r of refunds) {
    await prisma.refund.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  // ── Settlement batches (Phase D) ──────────────────────────────────────
  // A paid batch for last month (merchant1) and a confirmed one for
  // merchant3, with hand-written lines so the demo shows the flow without
  // depending on the relative transaction dates.
  const monthAgoFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) - 9 * 3_600_000);
  const monthAgoTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 9 * 3_600_000);
  const settlements = [
    {
      id: SEED_IDS.settlement1,
      merchantId: SEED_IDS.merchant1,
      livemode: false,
      periodFrom: monthAgoFrom,
      periodTo: monthAgoTo,
      grossAmount: 128_400,
      feeAmount: 4_390,
      refundAmount: 3_200,
      chargebackAmount: 0,
      settlementFee: 330,
      netAmount: 120_480,
      status: "paid",
      scheduledAt: new Date(monthAgoTo.getTime() + 29 * 86_400_000),
      paidAt: new Date(monthAgoTo.getTime() + 29 * 86_400_000),
      createdById: DEMO_ADMIN_ACCOUNTS.admin.id,
      createdAt: new Date(monthAgoTo.getTime() + 86_400_000),
      lines: [
        { kind: "payment", method: "credit", description: "ORD-2608-0142", amount: 64_800, fee: 2_332, occurredAt: new Date(monthAgoFrom.getTime() + 3 * 86_400_000) },
        { kind: "payment", method: "qr", description: "ORD-2608-0177", amount: 38_600, fee: 1_158, occurredAt: new Date(monthAgoFrom.getTime() + 12 * 86_400_000) },
        { kind: "payment", method: "credit", description: "ORD-2608-0203", amount: 25_000, fee: 900, occurredAt: new Date(monthAgoFrom.getTime() + 20 * 86_400_000) },
        { kind: "refund", method: "credit", description: "ORD-2608-0142", amount: -3_200, fee: 0, occurredAt: new Date(monthAgoFrom.getTime() + 25 * 86_400_000) },
      ],
    },
    {
      id: SEED_IDS.settlement2,
      merchantId: SEED_IDS.merchant3,
      livemode: false,
      periodFrom: monthAgoFrom,
      periodTo: monthAgoTo,
      grossAmount: 86_000,
      feeAmount: 1_312,
      refundAmount: 0,
      chargebackAmount: 0,
      settlementFee: 0,
      netAmount: 84_688,
      status: "confirmed",
      scheduledAt: new Date(monthAgoTo.getTime() + 14 * 86_400_000),
      createdById: DEMO_ADMIN_ACCOUNTS.admin.id,
      createdAt: new Date(monthAgoTo.getTime() + 86_400_000),
      lines: [
        { kind: "payment", method: "bank", description: "ORD-2608-0311", amount: 48_000, fee: 616, occurredAt: new Date(monthAgoFrom.getTime() + 8 * 86_400_000) },
        { kind: "payment", method: "bank", description: "ORD-2608-0345", amount: 38_000, fee: 696, occurredAt: new Date(monthAgoFrom.getTime() + 22 * 86_400_000) },
      ],
    },
  ];
  for (const { lines, ...b } of settlements) {
    await prisma.settlementBatch.upsert({ where: { id: b.id }, update: {}, create: { ...b, lines: { create: lines } } });
  }

  // ── Webhook deliveries (Phase E) ──────────────────────────────────────
  // A successful delivery, one retrying after a 500, and one abandoned after
  // five timeouts, each with its attempt history.
  const whHeaders = (ts: number) =>
    JSON.stringify({ "Content-Type": "application/json", "X-Signature": "v1=3f0c9c5d8f2b1a7e6d4c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e", "X-Timestamp": String(ts), "User-Agent": "WirePay-Notify/1.0" });
  // Body fields mirror the seeded transaction each delivery is about (Phase P5: merchant, amount, status, method, user, time).
  const whBody = (p: { paymentId: string; event: string; merchantCode: string; amount: number; status: string; method: string; userId: string; productId: string; paidAt: Date }) =>
    JSON.stringify({ payment_id: p.paymentId, event: p.event, merchant_id: p.merchantCode, amount: p.amount, currency: "JPY", paid_at: p.paidAt.toISOString(), status: p.status, payment_method: p.method, user_id: p.userId, product_id: p.productId });
  // Attempt times follow RETRY_DELAYS_MS (1 min → 5 min → 30 min → 2 h → 24 h) from the first try.
  const retryOffsetsMs = [0, 60_000, 6 * 60_000, 36 * 60_000, 156 * 60_000];
  const deliveries = [
    {
      id: SEED_IDS.webhook1,
      merchantId: SEED_IDS.merchant1,
      paymentId: SEED_IDS.payment1,
      livemode: false,
      event: "payment.completed",
      url: "/api/demo/webhook-receiver?result=ok",
      method: "POST",
      requestHeaders: whHeaders(Math.floor(hoursAgo(6).getTime() / 1000)),
      requestBody: whBody({ paymentId: SEED_IDS.payment1, event: "payment.completed", merchantCode: "MER-00001", amount: 4980, status: "captured", method: "credit", userId: "u_10021", productId: "春物ジャケット", paidAt: hoursAgo(6) }),
      responseStatus: 200,
      responseBody: JSON.stringify({ ok: true, data: { received: true } }),
      attempts: 1,
      status: "success",
      lastSentAt: hoursAgo(6),
      createdAt: hoursAgo(6),
      attemptLog: [{ attemptNo: 1, sentAt: hoursAgo(6), responseStatus: 200, responseBody: JSON.stringify({ ok: true, data: { received: true } }), durationMs: 143, trigger: "system" }],
    },
    {
      id: SEED_IDS.webhook2,
      merchantId: SEED_IDS.merchant2,
      paymentId: SEED_IDS.payment6,
      livemode: false,
      event: "payment.failed",
      url: "/api/demo/webhook-receiver?result=error",
      method: "POST",
      requestHeaders: whHeaders(Math.floor(daysAgo(2).getTime() / 1000)),
      requestBody: whBody({ paymentId: SEED_IDS.payment6, event: "payment.failed", merchantCode: "MER-00002", amount: 15800, status: "failed", method: "credit", userId: "u_20690", productId: "茶器セット", paidAt: daysAgo(2) }),
      responseStatus: 500,
      responseBody: JSON.stringify({ ok: false, error: { code: "demo_receiver_error", message: "simulated failure" } }),
      attempts: 2,
      status: "retrying",
      // Two failures so far (t0, t0 + 1 min); the third try is due 5 minutes after the second — kept in the future for the demo.
      nextRetryAt: new Date(now.getTime() + 30 * 60_000),
      lastSentAt: new Date(daysAgo(2).getTime() + retryOffsetsMs[1]),
      createdAt: daysAgo(2),
      attemptLog: [
        { attemptNo: 1, sentAt: daysAgo(2), responseStatus: 500, responseBody: "simulated failure", durationMs: 210, trigger: "system" },
        { attemptNo: 2, sentAt: new Date(daysAgo(2).getTime() + retryOffsetsMs[1]), responseStatus: 500, responseBody: "simulated failure", durationMs: 188, trigger: "cron" },
      ],
    },
    // Abandoned after five timeouts: the completion of merchant1's ORD-DEMO-002 (captured, ¥1,280) to a receiver that never answered.
    {
      id: SEED_IDS.webhook3,
      merchantId: SEED_IDS.merchant1,
      paymentId: SEED_IDS.payment2,
      livemode: false,
      event: "payment.completed",
      url: "/api/demo/webhook-receiver?result=timeout",
      method: "POST",
      requestHeaders: whHeaders(Math.floor(daysAgo(4).getTime() / 1000)),
      requestBody: whBody({ paymentId: SEED_IDS.payment2, event: "payment.completed", merchantCode: "MER-00001", amount: 1280, status: "captured", method: "credit", userId: "u_10388", productId: "ロゴTシャツ", paidAt: daysAgo(4) }),
      responseStatus: null,
      responseBody: "error: timeout",
      attempts: 5,
      status: "abandoned",
      lastSentAt: new Date(daysAgo(4).getTime() + retryOffsetsMs[4]),
      createdAt: daysAgo(4),
      attemptLog: retryOffsetsMs.map((offset, i) => ({ attemptNo: i + 1, sentAt: new Date(daysAgo(4).getTime() + offset), responseStatus: null, responseBody: null, error: "timeout", durationMs: 10_000, trigger: i === 0 ? "system" : "cron" })),
    },
  ];
  for (const { attemptLog, ...d } of deliveries) {
    await prisma.webhookDelivery.upsert({ where: { id: d.id }, update: {}, create: { ...d, attemptLog: { create: attemptLog } } });
  }

  // ── Risk (Phase F) ────────────────────────────────────────────────────
  await prisma.riskSetting.upsert({ where: { id: "global" }, update: {}, create: { id: "global", windowMinutes: 10, maxFailures: 3 } });
  const blacklist = [
    { id: SEED_IDS.blacklist1, kind: "ip", value: "198.51.100.77", reason: "複数加盟店で不正利用の報告", source: "manual", status: "active", createdById: DEMO_ADMIN_ACCOUNTS.admin.id, createdAt: daysAgo(12) },
    { id: SEED_IDS.blacklist2, kind: "card", value: "9c1185a5c5e9fc54612808977ee8f548b2258d31a4a6ea1a6ec0b0e4d0e6d6a1", reason: "auto: 3 failures in 10 min", source: "auto", status: "candidate", createdAt: hoursAgo(3) },
  ];
  for (const b of blacklist) {
    await prisma.blacklist.upsert({ where: { id: b.id }, update: {}, create: b });
  }
  await prisma.chargeback.upsert({
    where: { id: SEED_IDS.chargeback1 },
    update: {},
    create: {
      id: SEED_IDS.chargeback1,
      paymentId: SEED_IDS.payment2,
      merchantId: SEED_IDS.merchant1,
      livemode: false,
      amount: 1280,
      reasonCode: "not_received",
      status: "received",
      disputeDeadlineAt: daysAgo(-10),
      occurredAt: hoursAgo(20),
      createdAt: hoursAgo(20),
    },
  });

  // ── Email templates / logs and announcements (Phase G) ────────────────
  for (const tpl of DEFAULT_EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { key_lang: { key: tpl.key, lang: tpl.lang } }, update: {}, create: { key: tpl.key, lang: tpl.lang, subject: tpl.subject, body: tpl.body, enabled: true } });
  }
  const emails = [
    {
      id: SEED_IDS.email1,
      to: "taro@example.com",
      templateKey: "payment_completed",
      lang: "ja",
      subject: "【ハンドメイド雑貨 コトリ】お支払いを確認しました（注文番号 ORD-DEMO-001）",
      body: "山田 太郎 様\n\n注文番号 ORD-DEMO-001 のお支払い ¥4,980 を確認いたしました。\n取引ID: pay_demo_001\n\n商品の発送準備に入ります。今後ともよろしくお願いいたします。",
      status: "demo",
      provider: "log",
      paymentId: SEED_IDS.payment1,
      merchantId: SEED_IDS.merchant1,
      createdAt: hoursAgo(6),
    },
    {
      id: SEED_IDS.email2,
      to: "yumi@example.com",
      templateKey: "transfer_guide",
      lang: "ja",
      subject: "【築地まぐろ商店】お振込先のご案内（注文番号 ORD-LIVE-003）",
      body: "斎藤 由美 様\n\n以下の内容でお振込みをお願いいたします。\n\n振込金額: ¥9,800\n振込ID: 7788120\n振込期限: " + transferDueDate(daysAgo(2)).toISOString().slice(0, 10) + "\n商品: 海鮮丼セット",
      status: "demo",
      provider: "log",
      paymentId: SEED_IDS.payment10,
      merchantId: SEED_IDS.merchant3,
      createdAt: daysAgo(2),
    },
  ];
  for (const e of emails) {
    await prisma.emailLog.upsert({ where: { id: e.id }, update: {}, create: e });
  }
  await prisma.announcement.upsert({
    where: { id: SEED_IDS.announcement1 },
    update: {},
    create: {
      id: SEED_IDS.announcement1,
      kind: "maintenance",
      title: "定期メンテナンスのお知らせ（毎週火曜 02:00〜04:00）",
      body: "システム更新のため、毎週火曜日 02:00〜04:00（JST）に管理画面と加盟店 API が最大 10 分間停止します。決済申請の受付は継続します。",
      publishFrom: daysAgo(3),
      publishUntil: daysAgo(-30),
      targetAll: true,
      targetMerchantIds: "[]",
      status: "published",
      createdById: DEMO_ADMIN_ACCOUNTS.admin.id,
      createdAt: daysAgo(3),
    },
  });
  await prisma.announcement.upsert({
    where: { id: SEED_IDS.announcement2 },
    update: {},
    create: {
      id: SEED_IDS.announcement2,
      kind: "incident",
      title: "QR 決済の遅延について",
      body: "一部の QR 決済で完了通知が遅延しています。原因を調査中です。",
      publishFrom: hoursAgo(5),
      publishUntil: hoursAgo(1),
      targetAll: true,
      targetMerchantIds: "[]",
      status: "published",
      createdById: DEMO_ADMIN_ACCOUNTS.admin.id,
      createdAt: hoursAgo(5),
      updates: {
        create: [
          { phase: "occurred", body: "一部の QR 決済で完了通知が遅延しています。原因を調査中です。", createdAt: hoursAgo(5) },
          { phase: "investigating", body: "決済事業者側の通知遅延と判明。再送処理を実施中です。", createdAt: hoursAgo(3) },
          { phase: "resolved", body: "遅延していた通知の再送が完了しました。", createdAt: hoursAgo(1) },
        ],
      },
    },
  });

  // ── Subscriptions / payment links (Phase H) ───────────────────────────
  // Two plans for merchant1, an active subscription with one successful
  // charge (payment12) and a past-due one, plus an active payment link that
  // has been used once (payment13) and a disabled one. The sample
  // transactions are dated in the month before last so the settlement /
  // report expectations of the older tests (which cover last month) hold.
  const plans = [
    { id: SEED_IDS.plan1, merchantId: SEED_IDS.merchant1, name: "コトリ定期便（月額）", amount: 2980, interval: "monthly", trialDays: 14, active: true, createdAt: daysAgo(40) },
    { id: SEED_IDS.plan2, merchantId: SEED_IDS.merchant1, name: "コトリ定期便（年額）", amount: 29800, interval: "yearly", trialDays: 0, active: true, createdAt: daysAgo(40) },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({ where: { id: p.id }, update: {}, create: p });
  }
  const subscriptions = [
    {
      id: SEED_IDS.subscription1,
      merchantId: SEED_IDS.merchant1,
      planId: SEED_IDS.plan1,
      customerId: "u_10021",
      customerName: "山田 太郎",
      customerEmail: "taro@example.com",
      status: "active",
      livemode: false,
      startedAt: daysAgo(51),
      lastChargeAt: daysAgo(51),
      nextChargeAt: new Date(daysAgo(51).getTime() + 30 * 86_400_000),
      failCount: 0,
      createdAt: daysAgo(51),
    },
    {
      id: SEED_IDS.subscription2,
      merchantId: SEED_IDS.merchant1,
      planId: SEED_IDS.plan1,
      customerId: "u_10077",
      customerName: "佐藤 花子",
      customerEmail: "hanako@example.com",
      status: "past_due",
      livemode: false,
      startedAt: daysAgo(20),
      lastChargeAt: null,
      nextChargeAt: new Date(daysAgo(6).getTime() + 3 * 86_400_000),
      failCount: 1,
      createdAt: daysAgo(20),
    },
  ];
  for (const s of subscriptions) {
    await prisma.subscription.upsert({ where: { id: s.id }, update: {}, create: s });
  }
  const paymentLinks = [
    {
      id: SEED_IDS.paymentLink1,
      merchantId: SEED_IDS.merchant1,
      token: SEED_PAYMENT_LINK_TOKEN,
      productName: "限定トートバッグ",
      amount: 3200,
      description: "数量限定のキャンバストート。決済完了後 3 営業日以内に発送します。",
      expiresAt: null,
      maxUses: 50,
      usedCount: 1,
      status: "active",
      livemode: false,
      createdById: DEMO_ADMIN_ACCOUNTS.admin.id,
      createdAt: daysAgo(45),
    },
    {
      id: SEED_IDS.paymentLink2,
      merchantId: SEED_IDS.merchant2,
      token: "sakurademolinktoken000002",
      productName: "オンライン講座（単発）",
      amount: 5500,
      description: null,
      expiresAt: daysAgo(1),
      maxUses: null,
      usedCount: 0,
      status: "disabled",
      livemode: false,
      createdById: DEMO_ADMIN_ACCOUNTS.cs.id,
      createdAt: daysAgo(10),
    },
  ];
  for (const l of paymentLinks) {
    await prisma.paymentLink.upsert({ where: { id: l.id }, update: {}, create: l });
  }
  const phaseHPayments = [
    {
      id: SEED_IDS.payment12,
      providerId: stripe.id,
      merchantId: SEED_IDS.merchant1,
      subscriptionId: SEED_IDS.subscription1,
      method: "credit",
      orderNumber: "SUB-DEMO-0001",
      productName: "コトリ定期便（月額）",
      amount: 2980,
      status: "captured",
      externalId: "stripe_demo_sub_001",
      customerName: "山田 太郎",
      customerId: "u_10021",
      customerEmail: "taro@example.com",
      description: "定期課金 1 回目",
      createdAt: daysAgo(51),
      capturedAt: daysAgo(51),
      events: [ev("created", null, "authorized", 2980, "system", daysAgo(51)), ev("capture", "authorized", "captured", 2980, "system", daysAgo(51))],
    },
    {
      id: SEED_IDS.payment13,
      providerId: paypay.id,
      merchantId: SEED_IDS.merchant1,
      paymentLinkId: SEED_IDS.paymentLink1,
      method: "qr",
      orderNumber: "LNK-KOTORI-0001",
      productName: "限定トートバッグ",
      amount: 3200,
      status: "captured",
      externalId: "paypay_demo_link_001",
      customerName: "鈴木 一郎",
      customerId: "ichiro@example.com",
      customerEmail: "ichiro@example.com",
      description: "数量限定のキャンバストート。決済完了後 3 営業日以内に発送します。",
      createdAt: daysAgo(40),
      capturedAt: daysAgo(40),
      events: [ev("created", null, "authorized", 3200, "system", daysAgo(40)), ev("capture", "authorized", "captured", 3200, "system", daysAgo(40))],
    },
  ];
  for (const { events, ...p } of phaseHPayments) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: { ...p, livemode: false, events: { create: events } } });
  }

  // ── Phase K: konbini slips and a receipt ──────────────────────────────
  // One slip awaiting payment (due in 2 days) and one paid at the store
  // three days ago with a receipt issued from the dashboard.
  const cvsPayments = [
    {
      id: SEED_IDS.payment14,
      providerId: cvs.id,
      merchantId: SEED_IDS.merchant3,
      method: "convenience",
      orderNumber: "ORD-DEMO-014",
      productName: "本まぐろ赤身 300g",
      amount: 3980,
      status: "awaiting_payment",
      externalId: "cvs_demo_014",
      customerName: "小林 直樹",
      customerId: "u_30211",
      customerEmail: "naoki@example.com",
      description: "本まぐろ赤身 300g x 1",
      cvsBrand: "lawson",
      cvsReceiptNo: SEED_CVS_RECEIPT_NOS[SEED_IDS.payment14],
      transferDueAt: cvsDueDate(daysAgo(1), 3),
      createdAt: daysAgo(1),
      events: [ev("created", null, "awaiting_payment", 3980, "seed", daysAgo(1))],
    },
    {
      id: SEED_IDS.payment15,
      providerId: cvs.id,
      merchantId: SEED_IDS.merchant3,
      method: "convenience",
      orderNumber: "ORD-DEMO-015",
      productName: "本まぐろ大トロ 200g",
      amount: 5400,
      status: "captured",
      externalId: "cvs_demo_015",
      customerName: "松本 彩",
      customerId: "u_30187",
      customerEmail: "aya@example.com",
      description: "本まぐろ大トロ 200g x 1",
      cvsBrand: "seven",
      cvsReceiptNo: SEED_CVS_RECEIPT_NOS[SEED_IDS.payment15],
      cvsPaidAt: daysAgo(3),
      transferDueAt: cvsDueDate(daysAgo(4), 3),
      depositAmount: 5400,
      createdAt: daysAgo(4),
      capturedAt: daysAgo(3),
      events: [ev("created", null, "awaiting_payment", 5400, "seed", daysAgo(4)), ev("deposit", "awaiting_payment", "captured", 5400, "cvs", daysAgo(3))],
    },
  ];
  for (const { events, ...p } of cvsPayments) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: { ...p, livemode: false, events: { create: events } } });
  }

  // An expired bank transfer whose money arrived after the deadline (Phase
  // P1-3): the deposit notification filed it as a late deposit (below).
  await prisma.payment.upsert({
    where: { id: SEED_IDS.payment16 },
    update: {},
    create: {
      id: SEED_IDS.payment16,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant3,
      method: "bank",
      orderNumber: "ORD-DEMO-016",
      productName: "本まぐろ中トロ 500g",
      amount: 12_000,
      status: "expired",
      livemode: false,
      externalId: "bank_demo_016",
      customerName: "高橋 結衣",
      customerId: "u_30402",
      customerEmail: "yui@example.com",
      description: "本まぐろ中トロ 500g x 1",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16],
      transferDueAt: transferDueDate(daysAgo(12)),
      createdAt: daysAgo(12),
      events: { create: [ev("created", null, "awaiting_transfer", 12_000, "seed", daysAgo(12)), ev("expire", "awaiting_transfer", "expired", 12_000, "system", daysAgo(4))] },
    },
  });
  // Test-mode deposit differences (Phase P5) so the screen has rows without
  // switching to live mode: a short deposit still awaiting the balance and an
  // excess deposit that completed the transaction. Dated outside the reports'
  // sample window (created 40 days ago) to keep the seeded KPIs unchanged.
  const diffSamples = [
    {
      id: SEED_IDS.payment17,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant2,
      method: "bank",
      orderNumber: "ORD-DEMO-017",
      productName: "煎茶ギフトセット",
      amount: 9_000,
      status: "awaiting_transfer",
      livemode: false,
      externalId: "bank_demo_017",
      customerName: "中村 咲",
      customerId: "u_20734",
      customerEmail: "saki@example.com",
      description: "煎茶ギフトセット x 1",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment17],
      transferDueAt: transferDueDate(daysAgo(-5)),
      depositAmount: 7_000,
      depositDiff: "short",
      depositDiffStatus: "open",
      createdAt: daysAgo(40),
      events: { create: [ev("created", null, "awaiting_transfer", 9_000, "seed", daysAgo(40)), ev("deposit", "awaiting_transfer", "awaiting_transfer", 7_000, "bank", daysAgo(39))] },
    },
    {
      id: SEED_IDS.payment18,
      providerId: bank.id,
      merchantId: SEED_IDS.merchant2,
      method: "bank",
      orderNumber: "ORD-DEMO-018",
      productName: "抹茶セット",
      amount: 6_500,
      status: "captured",
      livemode: false,
      externalId: "bank_demo_018",
      customerName: "小野 健",
      customerId: "u_20801",
      customerEmail: "ken@example.com",
      description: "抹茶セット x 1",
      transferId: SEED_TRANSFER_IDS[SEED_IDS.payment18],
      transferDueAt: transferDueDate(daysAgo(40)),
      depositAmount: 7_000,
      depositDiff: "excess",
      depositDiffStatus: "open",
      createdAt: daysAgo(40),
      capturedAt: daysAgo(39),
      events: { create: [ev("created", null, "awaiting_transfer", 6_500, "seed", daysAgo(40)), ev("deposit", "awaiting_transfer", "captured", 7_000, "bank", daysAgo(39))] },
    },
  ];
  for (const p of diffSamples) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: p });
  }

  const receiptMonth = partsInTz(daysAgo(3));
  await prisma.receipt.upsert({
    where: { id: SEED_IDS.receipt1 },
    update: {},
    create: {
      id: SEED_IDS.receipt1,
      receiptNo: `RC-${receiptMonth.y}${String(receiptMonth.m).padStart(2, "0")}-00001`,
      paymentId: SEED_IDS.payment15,
      merchantId: SEED_IDS.merchant3,
      livemode: false,
      recipientName: "松本 彩",
      amount: 5400,
      source: "dashboard",
      issuedById: DEMO_ADMIN_ACCOUNTS.accounting.id,
      reissueCount: 0,
      issuedAt: daysAgo(2),
      lastIssuedAt: daysAgo(2),
    },
  });

  // ── Unmatched deposits (未消込入金) ────────────────────────────────────
  // (the third row is the late deposit for the expired ORD-DEMO-016)
  // A deposit that arrived without the transfer id (same amount as the
  // awaiting transfer ORD-DEMO-005, so the match dialog suggests it) and one
  // already dismissed.
  const unmatchedDeposits = [
    { id: SEED_IDS.unmatched1, livemode: false, amount: 6600, payerName: "ワタナベ ケン", receivedAt: hoursAgo(20), bankReference: "20260902-000317", givenTransferId: null, note: null, source: "bank", status: "unmatched", createdAt: hoursAgo(20) },
    { id: SEED_IDS.unmatched2, livemode: false, amount: 3000, payerName: "サトウ ハナコ", receivedAt: daysAgo(6), bankReference: "20260828-000122", givenTransferId: "123", note: "振込IDが 3 桁のみ", source: "manual", status: "dismissed", dismissKind: "returned", dismissReason: "本人確認のうえ組戻し（返金）済み", createdAt: daysAgo(6) },
    // A deposit that arrived after the transfer expired (ORD-DEMO-016, Phase P1-3): support applies it as a late deposit or arranges a return.
    { id: SEED_IDS.unmatched3, livemode: false, amount: 12_000, payerName: "タカハシ ユイ", receivedAt: hoursAgo(5), bankReference: "20260903-000041", givenTransferId: SEED_TRANSFER_IDS[SEED_IDS.payment16], note: null, source: "bank", status: "unmatched", reason: "late_deposit", candidatePaymentId: SEED_IDS.payment16, createdAt: hoursAgo(5) },
  ];
  for (const d of unmatchedDeposits) {
    await prisma.unmatchedDeposit.upsert({ where: { id: d.id }, update: {}, create: d });
  }

  // ── Deposit notification log (Phase P1-1) ──────────────────────────────
  // The bank / konbini callbacks that produced the seeded reconciliations
  // and unmatched deposits, including a re-sent (duplicate) one.
  const depositNotifications = [
    { id: SEED_IDS.depositNotification1, notificationNo: "DN-00001", source: "bank", eventId: "bank-evt-20260901-0007", dedupeKey: "bank:evt:bank-evt-20260901-0007", claimKey: "bank:evt:bank-evt-20260901-0007", livemode: false, transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7], amount: 12_800, receivedAt: daysAgo(2), payerName: "スズキ タロウ", bankReference: "20260901-000221", result: "applied", resultReason: null, paymentId: SEED_IDS.payment7, rawBody: JSON.stringify({ eventId: "bank-evt-20260901-0007", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7], amount: 12_800, mode: "test" }), createdAt: daysAgo(2) },
    { id: SEED_IDS.depositNotification2, notificationNo: "DN-00002", source: "bank", eventId: "bank-evt-20260901-0007", dedupeKey: "bank:evt:bank-evt-20260901-0007", claimKey: null, duplicateOfId: SEED_IDS.depositNotification1, livemode: false, transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7], amount: 12_800, receivedAt: daysAgo(2), payerName: "スズキ タロウ", bankReference: "20260901-000221", result: "duplicate", resultReason: null, paymentId: SEED_IDS.payment7, rawBody: JSON.stringify({ eventId: "bank-evt-20260901-0007", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment7], amount: 12_800, mode: "test" }), createdAt: new Date(daysAgo(2).getTime() + 90_000) },
    { id: SEED_IDS.depositNotification3, notificationNo: "DN-00003", source: "bank", eventId: null, dedupeKey: "bank:h:seed-unmatched-1", claimKey: "bank:h:seed-unmatched-1", livemode: false, transferId: null, amount: 6600, receivedAt: hoursAgo(20), payerName: "ワタナベ ケン", bankReference: "20260902-000317", result: "unmatched", resultReason: "no_id", paymentId: null, unmatchedDepositId: SEED_IDS.unmatched1, rawBody: JSON.stringify({ amount: 6600, payerName: "ワタナベ ケン", bankReference: "20260902-000317", mode: "test" }), createdAt: hoursAgo(20) },
    { id: SEED_IDS.depositNotification4, notificationNo: "DN-00004", source: "bank", eventId: "bank-evt-20260903-0041", dedupeKey: "bank:evt:bank-evt-20260903-0041", claimKey: "bank:evt:bank-evt-20260903-0041", livemode: false, transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16], amount: 12_000, receivedAt: hoursAgo(5), payerName: "タカハシ ユイ", bankReference: "20260903-000041", result: "unmatched", resultReason: "late_deposit", paymentId: SEED_IDS.payment16, unmatchedDepositId: SEED_IDS.unmatched3, rawBody: JSON.stringify({ eventId: "bank-evt-20260903-0041", transferId: SEED_TRANSFER_IDS[SEED_IDS.payment16], amount: 12_000, mode: "test" }), createdAt: hoursAgo(5) },
  ];
  for (const n of depositNotifications) {
    await prisma.depositNotification.upsert({ where: { id: n.id }, update: {}, create: n });
  }

  // ── Phase I: notes, payment-method switch, global settings ────────────
  await prisma.globalSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", viewerCsvExport: false, issuerName: "ワイヤーペイ株式会社", issuerRegistrationNo: "T9876543210987", issuerAddress: "東京都千代田区丸の内 1-1-1 ワイヤービル 10F", issuerTel: "03-0000-0000", taxRounding: "floor" },
  });
  const notes = [
    { id: SEED_IDS.note1, paymentId: SEED_IDS.payment4, authorId: DEMO_ADMIN_ACCOUNTS.cs.id, body: "お客様より「振込は明日行う」と電話連絡あり。期限延長の希望は無し。", pinned: true, createdAt: daysAgo(1) },
    { id: SEED_IDS.note2, paymentId: SEED_IDS.payment2, authorId: DEMO_ADMIN_ACCOUNTS.admin.id, body: "返金申請の理由を確認済み。写真は加盟店から受領。", pinned: false, createdAt: hoursAgo(3) },
  ];
  for (const n of notes) {
    await prisma.transactionNote.upsert({ where: { id: n.id }, update: {}, create: n });
  }
  // merchant2 has QR suspended (a merchant-level switch); no global switch is on.
  await prisma.paymentMethodControl.upsert({
    where: { id: SEED_IDS.methodControl1 },
    update: {},
    create: { id: SEED_IDS.methodControl1, scope: "merchant", merchantId: SEED_IDS.merchant2, method: "qr", suspended: true, reason: "QR 決済事業者側の障害対応中（加盟店からの依頼）", suspendedById: DEMO_ADMIN_ACCOUNTS.cs.id, suspendedAt: hoursAgo(5), createdAt: hoursAgo(5) },
  });

  // ── Phase J: notification centre samples ──────────────────────────────
  const notifications = [
    { id: SEED_IDS.notification1, kind: "webhook.abandoned", severity: "critical", title: "Webhook abandoned: payment.completed → MER-00001", body: "5 attempts failed for /api/demo/webhook-receiver?result=timeout. Resend it from the delivery log once the merchant endpoint is back.", href: `/webhook-logs/${SEED_IDS.webhook3}`, roles: JSON.stringify(["admin", "developer"]), targetType: "webhook_delivery", targetId: SEED_IDS.webhook3, createdAt: hoursAgo(26), dispatchedAt: hoursAgo(26) },
    { id: SEED_IDS.notification2, kind: "refund.requested", severity: "info", title: "Refund requested: ¥500", body: "partial refund (defect) awaiting a decision.", href: `/refunds/${SEED_IDS.refund1}`, roles: JSON.stringify(["admin", "accounting"]), targetType: "refund", targetId: SEED_IDS.refund1, createdAt: hoursAgo(2), dispatchedAt: hoursAgo(2) },
    { id: SEED_IDS.notification3, kind: "payment_method.suspended", severity: "warning", title: "Merchant payment method suspended: qr", body: "QR 決済事業者側の障害対応中（加盟店からの依頼）", href: `/merchants/${SEED_IDS.merchant2}?tab=methods`, roles: JSON.stringify(["admin", "cs"]), targetType: "payment_method_control", targetId: SEED_IDS.methodControl1, createdAt: hoursAgo(5), dispatchedAt: hoursAgo(5) },
  ];
  for (const n of notifications) {
    await prisma.notification.upsert({ where: { id: n.id }, update: {}, create: n });
  }
  await prisma.notificationPreference.upsert({ where: { adminUserId_kind: { adminUserId: DEMO_ADMIN_ACCOUNTS.admin.id, kind: "payment_method.suspended" } }, update: {}, create: { adminUserId: DEMO_ADMIN_ACCOUNTS.admin.id, kind: "payment_method.suspended", email: true, slack: false } });

  // ── Audit log samples ─────────────────────────────────────────────────
  const audits = [
    {
      id: SEED_IDS.audit1,
      actorType: "admin",
      actorId: DEMO_ADMIN_ACCOUNTS.admin.id,
      action: "merchant.update",
      targetType: "merchant",
      targetId: SEED_IDS.merchant2,
      before: JSON.stringify({ emailNotification: "per_payment", transferIdDigits: 7 }),
      after: JSON.stringify({ emailNotification: "daily", transferIdDigits: 8 }),
      ip: "203.0.113.10",
      createdAt: daysAgo(11),
    },
    {
      id: SEED_IDS.audit2,
      actorType: "bank",
      actorId: null,
      action: "payment.deposit",
      targetType: "payment",
      targetId: SEED_IDS.payment7,
      before: JSON.stringify({ status: "awaiting_transfer", depositAmount: null }),
      after: JSON.stringify({ status: "captured", depositAmount: 12000, depositDiff: null, amount: 12000 }),
      ip: null,
      createdAt: daysAgo(1),
    },
    {
      id: SEED_IDS.audit3,
      actorType: "admin",
      actorId: DEMO_ADMIN_ACCOUNTS.admin.id,
      action: "ip_restriction.create",
      targetType: "ip_restriction",
      targetId: SEED_IDS.ip4,
      before: null,
      after: JSON.stringify({ target: "admin", cidr: "203.0.113.200", mode: "deny", enabled: true, label: "blocked source" }),
      ip: "203.0.113.10",
      createdAt: daysAgo(3),
    },
  ];
  for (const a of audits) {
    await prisma.auditLog.upsert({ where: { id: a.id }, update: {}, create: a });
  }

  // ── Phase M: customer master ───────────────────────────────────────────
  // Every seeded transaction with a merchant + customer id gets its Customer
  // row (idempotent backfill), then a few extras: a phone number, a stored
  // card token and one customer anonymised by the retention job.
  await linkExistingPayments(prisma);
  // Phase P1: konbini status + invoice numbers of confirmed batches (idempotent).
  await runPhase1Backfill(prisma);
  const customer1 = await prisma.customer.findUnique({ where: { merchantId_externalId: { merchantId: SEED_IDS.merchant1, externalId: "u_10021" } }, select: { id: true } });
  if (customer1) {
    await prisma.customer.update({ where: { id: customer1.id }, data: { phone: "090-1234-5678" } });
    await prisma.paymentToken.upsert({
      where: { customerId_cardHash: { customerId: customer1.id, cardHash: cardFingerprint({ brand: "visa", last4: "4242", expiry: "12/28" }) } },
      update: {},
      create: { customerId: customer1.id, brand: "visa", last4: "4242", expiry: "12/28", cardHash: cardFingerprint({ brand: "visa", last4: "4242", expiry: "12/28" }), label: "メインカード", createdAt: daysAgo(51), lastUsedAt: hoursAgo(6) },
    });
  }
  await prisma.customer.upsert({
    where: { id: SEED_IDS.customerAnonymized },
    update: {},
    create: { id: SEED_IDS.customerAnonymized, merchantId: SEED_IDS.merchant2, externalId: "u_20099", name: null, email: null, phone: null, anonymizedAt: daysAgo(3), createdAt: daysAgo(400) },
  });
  await prisma.anonymizeBatch.upsert({
    where: { id: SEED_IDS.anonymizeBatch1 },
    update: {},
    create: { id: SEED_IDS.anonymizeBatch1, kind: "retention", customers: 1, payments: 0, tokens: 0, auditLogs: 0, startedAt: daysAgo(3), finishedAt: daysAgo(3) },
  });

  return {
    providers: 4,
    payments: payments.length,
    merchants: merchants.length,
    agents: agents.length,
    ipRestrictions: ips.length,
    admins: admins.length,
    auditLogs: audits.length,
    feeSchedules: feeSchedules.length,
    limits: limits.length,
    apiKeys: apiKeys.length,
  };
}

/** Remove all demo data (used by the demo reset endpoint and tests). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.apiRateLimit.deleteMany();
  await prisma.slackLog.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.transactionNote.deleteMany();
  await prisma.paymentMethodControl.deleteMany();
  await prisma.globalSetting.deleteMany();
  await prisma.announcementUpdate.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.ipRestriction.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.webhookAttempt.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.settlementLine.deleteMany();
  await prisma.settlementBatch.deleteMany();
  await prisma.chargeback.deleteMany();
  await prisma.blacklist.deleteMany();
  await prisma.riskSetting.deleteMany();
  await prisma.depositNotification.deleteMany();
  await prisma.unmatchedDeposit.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.anonymizeBatch.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.merchantLimit.deleteMany();
  await prisma.merchantFeeSchedule.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.paymentProvider.deleteMany();
}
