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
      notifyUrl: "https://kotori.example.jp/wirepay/notify",
      notifyFormat: "json_post",
      notifyParamSet: "standard",
      notifyIdFormat: "payment_id",
      emailNotification: "per_payment",
      agentId: SEED_IDS.agent1,
      enabledMethods: JSON.stringify(["credit", "qr"]),
      transferIdDigits: 7,
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
      notifyUrl: "https://sakura-cha.example.jp/api/payment/callback",
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
      notifyUrl: "https://tsukiji-maguro.example.jp/notify",
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
    await prisma.apiKey.upsert({ where: { id: k.id }, update: {}, create: { ...k, keyPrefix: displayPrefix(plaintext), keyHash: hashApiKey(plaintext) } });
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
