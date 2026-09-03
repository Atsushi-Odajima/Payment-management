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
import { hashPassword } from "../lib/admin/password";
import { PLAN_DEFAULT_RATES } from "../lib/merchants/fees";
import { displayPrefix } from "../lib/merchants/api-keys";
import { hashApiKey } from "../lib/merchants/api-keys-server";
import { encryptSigningSecret } from "../lib/merchants/secrets";
import { DEMO_ADMIN_ACCOUNTS } from "./seed-accounts";

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
  adminMaster: DEMO_ADMIN_ACCOUNTS.master.id,
  adminGeneral: DEMO_ADMIN_ACCOUNTS.general.id,
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
  refund1: "ref_demo_001",
  refund2: "ref_demo_002",
  settlement1: "stl_demo_001",
  settlement2: "stl_demo_002",
  webhook1: "whd_demo_001",
  webhook2: "whd_demo_002",
  webhook3: "whd_demo_003",
  payment10: "pay_demo_010",
  payment11: "pay_demo_011",
  chargeback1: "cb_demo_001",
  blacklist1: "bl_demo_001",
  blacklist2: "bl_demo_002",
} as const;

/**
 * Fixed plaintext API keys of the demo merchants (only the SHA-256 hash is
 * stored; these are exported so tests and the manual can call the merchant API).
 */
export const SEED_API_KEYS = {
  [SEED_IDS.apiKey1]: "wp_test_ak_KotoriDemoTestKey000000000000001", // merchant1, active
  [SEED_IDS.apiKey2]: "wp_live_ak_KotoriDemoLiveKey000000000000002", // merchant1, active
  [SEED_IDS.apiKey3]: "wp_test_ss_KotoriDemoSigning000000000000003", // merchant1, signing secret
  [SEED_IDS.apiKey4]: "wp_test_ak_SakuraDemoRevoked000000000000004", // merchant2, revoked
} as const;

/** Demo merchant passwords (fixed so the master-role reveal is reproducible). */
export const SEED_MERCHANT_PASSWORDS = {
  [SEED_IDS.merchant1]: "Kotori2026Demo",
  [SEED_IDS.merchant2]: "Sakura2026Demo",
  [SEED_IDS.merchant3]: "Tsukiji2026Demo",
} as const;

/** Fixed bank-transfer ids of the seeded transfers (used by tests and the manual). */
export const SEED_TRANSFER_IDS = {
  [SEED_IDS.payment4]: "48213907", // merchant2 issues 8-digit ids
  [SEED_IDS.payment5]: "7301256", // merchant3 issues 7-digit ids
  [SEED_IDS.payment7]: "5120983",
  [SEED_IDS.payment9]: "6642019",
  [SEED_IDS.payment10]: "7788120",
  [SEED_IDS.payment11]: "7788121",
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
  const admins = [DEMO_ADMIN_ACCOUNTS.master, DEMO_ADMIN_ACCOUNTS.general];
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
      requestedById: DEMO_ADMIN_ACCOUNTS.general.id,
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
      requestedById: DEMO_ADMIN_ACCOUNTS.general.id,
      approvedById: DEMO_ADMIN_ACCOUNTS.master.id,
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
      createdById: DEMO_ADMIN_ACCOUNTS.master.id,
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
      createdById: DEMO_ADMIN_ACCOUNTS.master.id,
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
  const whBody = (paymentId: string, event: string, amount: number, status: string) =>
    JSON.stringify({ payment_id: paymentId, event, merchant_id: "MER-00001", amount, currency: "JPY", paid_at: hoursAgo(6).toISOString(), status, payment_method: "credit", user_id: "u_10021", product_id: "SKU-DEMO" });
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
      requestBody: whBody(SEED_IDS.payment1, "payment.completed", 4980, "captured"),
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
      requestBody: whBody(SEED_IDS.payment6, "payment.failed", 15800, "failed"),
      responseStatus: 500,
      responseBody: JSON.stringify({ ok: false, error: { code: "demo_receiver_error", message: "simulated failure" } }),
      attempts: 2,
      status: "retrying",
      nextRetryAt: new Date(now.getTime() + 30 * 60_000),
      lastSentAt: hoursAgo(1),
      createdAt: daysAgo(2),
      attemptLog: [
        { attemptNo: 1, sentAt: daysAgo(2), responseStatus: 500, responseBody: "simulated failure", durationMs: 210, trigger: "system" },
        { attemptNo: 2, sentAt: hoursAgo(1), responseStatus: 500, responseBody: "simulated failure", durationMs: 188, trigger: "cron" },
      ],
    },
    {
      id: SEED_IDS.webhook3,
      merchantId: SEED_IDS.merchant2,
      paymentId: SEED_IDS.payment3,
      livemode: false,
      event: "payment.completed",
      url: "https://sakura-cha.example.jp/api/wirepay",
      method: "POST",
      requestHeaders: whHeaders(Math.floor(daysAgo(4).getTime() / 1000)),
      requestBody: whBody(SEED_IDS.payment3, "payment.completed", 3200, "captured"),
      responseStatus: null,
      responseBody: "error: timeout",
      attempts: 5,
      status: "abandoned",
      lastSentAt: daysAgo(3),
      createdAt: daysAgo(4),
      attemptLog: [1, 2, 3, 4, 5].map((n) => ({ attemptNo: n, sentAt: new Date(daysAgo(4).getTime() + n * 3_600_000), responseStatus: null, responseBody: null, error: "timeout", durationMs: 10_000, trigger: n === 1 ? "system" : "cron" })),
    },
  ];
  for (const { attemptLog, ...d } of deliveries) {
    await prisma.webhookDelivery.upsert({ where: { id: d.id }, update: {}, create: { ...d, attemptLog: { create: attemptLog } } });
  }

  // ── Risk (Phase F) ────────────────────────────────────────────────────
  await prisma.riskSetting.upsert({ where: { id: "global" }, update: {}, create: { id: "global", windowMinutes: 10, maxFailures: 3 } });
  const blacklist = [
    { id: SEED_IDS.blacklist1, kind: "ip", value: "198.51.100.77", reason: "複数加盟店で不正利用の報告", source: "manual", status: "active", createdById: DEMO_ADMIN_ACCOUNTS.master.id, createdAt: daysAgo(12) },
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

  // ── Audit log samples ─────────────────────────────────────────────────
  const audits = [
    {
      id: SEED_IDS.audit1,
      actorType: "admin",
      actorId: DEMO_ADMIN_ACCOUNTS.master.id,
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
      actorId: DEMO_ADMIN_ACCOUNTS.master.id,
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

  return {
    providers: 3,
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
  await prisma.paymentEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.merchantLimit.deleteMany();
  await prisma.merchantFeeSchedule.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.paymentProvider.deleteMany();
}
