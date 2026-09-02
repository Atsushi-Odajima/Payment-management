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

export const SEED_IDS = {
  stripeProvider: "prov_stripe_demo",
  paypayProvider: "prov_paypay_demo",
  payment1: "pay_demo_001",
  payment2: "pay_demo_002",
  payment3: "pay_demo_003",
  merchant1: "mer_demo_001",
  merchant2: "mer_demo_002",
  merchant3: "mer_demo_003",
  agent1: "agt_demo_001",
  agent2: "agt_demo_002",
  application1: "app_demo_001",
  application2: "app_demo_002",
  application3: "app_demo_003",
  application4: "app_demo_004",
  ip1: "ip_demo_001",
  ip2: "ip_demo_002",
  ip3: "ip_demo_003",
} as const;

/** Demo merchant passwords (fixed so the master-role reveal is reproducible). */
export const SEED_MERCHANT_PASSWORDS = {
  [SEED_IDS.merchant1]: "Kotori2026Demo",
  [SEED_IDS.merchant2]: "Sakura2026Demo",
  [SEED_IDS.merchant3]: "Tsukiji2026Demo",
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
  applications: number;
  ipRestrictions: number;
}

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

  // ── Payments ──────────────────────────────────────────────────────────
  const payments = [
    {
      id: SEED_IDS.payment1,
      providerId: stripe.id,
      orderNumber: "ORD-DEMO-001",
      amount: 4980,
      status: "captured",
      externalId: "stripe_demo_001",
      customerName: "山田 太郎",
      customerEmail: "taro@example.com",
      description: "春物ジャケット",
      createdAt: hoursAgo(6),
      capturedAt: hoursAgo(6),
    },
    {
      id: SEED_IDS.payment2,
      providerId: paypay.id,
      orderNumber: "ORD-DEMO-002",
      amount: 1280,
      status: "captured",
      externalId: "paypay_demo_002",
      customerName: "鈴木 花子",
      description: "ロゴTシャツ",
      createdAt: hoursAgo(3),
      capturedAt: hoursAgo(3),
    },
    {
      id: SEED_IDS.payment3,
      providerId: stripe.id,
      orderNumber: "ORD-DEMO-003",
      amount: 9800,
      status: "authorized",
      externalId: "stripe_demo_003",
      customerName: "佐藤 次郎",
      description: "ハンドメイドバッグ",
      createdAt: hoursAgo(1),
    },
  ];
  for (const p of payments) {
    await prisma.payment.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...p,
        livemode: false,
        events: {
          create: [
            { type: "created", fromStatus: null, toStatus: "authorized", amount: p.amount, actor: "seed", createdAt: p.createdAt },
            ...(p.status === "captured"
              ? [{ type: "capture", fromStatus: "authorized", toStatus: "captured", amount: p.amount, actor: "seed", createdAt: p.capturedAt ?? p.createdAt }]
              : []),
          ],
        },
      },
    });
  }

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
      enabledMethods: JSON.stringify(["credit"]),
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
      enabledMethods: JSON.stringify([]),
      createdAt: daysAgo(2),
    },
  ] as const;
  for (const m of merchants) {
    await prisma.merchant.upsert({
      where: { id: m.id },
      update: {},
      create: { ...m, passwordEnc: encryptMerchantPassword(SEED_MERCHANT_PASSWORDS[m.id]) },
    });
  }

  // ── Payment applications ──────────────────────────────────────────────
  const applications = [
    {
      id: SEED_IDS.application1,
      applicationCode: "APP-00001",
      merchantId: SEED_IDS.merchant3,
      type: "new_use",
      method: "credit",
      note: "新規出店に伴いクレジットカード決済を利用開始したい。想定月商 150 万円。",
      status: "pending",
      appliedAt: daysAgo(1),
    },
    {
      id: SEED_IDS.application2,
      applicationCode: "APP-00002",
      merchantId: SEED_IDS.merchant2,
      type: "add_method",
      method: "convenience",
      note: "ギフト需要に対応するためコンビニ決済を追加したい。",
      status: "pending",
      appliedAt: hoursAgo(5),
    },
    {
      id: SEED_IDS.application3,
      applicationCode: "APP-00003",
      merchantId: SEED_IDS.merchant1,
      type: "add_method",
      method: "qr",
      note: "PayPay 対応の要望が多いため QR 決済を追加。",
      status: "approved",
      appliedAt: daysAgo(20),
      reviewedAt: daysAgo(18),
      reviewerNote: "審査基準を満たしているため承認。",
    },
    {
      id: SEED_IDS.application4,
      applicationCode: "APP-00004",
      merchantId: SEED_IDS.merchant2,
      type: "limit_change",
      method: "credit",
      note: "月間限度額を 300 万円から 1,000 万円へ引き上げたい。",
      status: "rejected",
      appliedAt: daysAgo(8),
      reviewedAt: daysAgo(6),
      reviewerNote: "直近 3 か月の取引実績が基準に達していないため否認。実績確認後に再申請してください。",
    },
  ];
  for (const a of applications) {
    await prisma.paymentApplication.upsert({ where: { id: a.id }, update: {}, create: a });
  }

  // ── IP restrictions ───────────────────────────────────────────────────
  const ips = [
    { id: SEED_IDS.ip1, target: "admin", merchantId: null, cidr: "203.0.113.10", label: "本社オフィス (固定IP)", enabled: true, createdAt: daysAgo(50) },
    { id: SEED_IDS.ip2, target: "admin", merchantId: null, cidr: "198.51.100.0/24", label: "運用センター VPN", enabled: true, createdAt: daysAgo(45) },
    { id: SEED_IDS.ip3, target: "merchant_api", merchantId: SEED_IDS.merchant1, cidr: "192.0.2.0/28", label: "コトリ 本番サーバー", enabled: false, createdAt: daysAgo(10) },
  ];
  for (const r of ips) {
    await prisma.ipRestriction.upsert({ where: { id: r.id }, update: {}, create: r });
  }

  return {
    providers: 2,
    payments: payments.length,
    merchants: merchants.length,
    agents: agents.length,
    applications: applications.length,
    ipRestrictions: ips.length,
  };
}

/** Remove all demo data (used by the demo reset endpoint and tests). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.ipRestriction.deleteMany();
  await prisma.paymentApplication.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentProvider.deleteMany();
}
