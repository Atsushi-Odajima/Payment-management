// Deterministic demo data. Fixed ids + upserts make the seed safe to re-run
// and let tests / the demo reset endpoint reference known records.
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
  /** Seed even if providers already exist (used by demo reset / tests). */
  force?: boolean;
}

export async function seed(
  prisma: PrismaClient,
  opts: SeedOptions = {},
): Promise<{ skipped: boolean }> {
  const now = opts.now ?? new Date();
  if (!opts.force) {
    const existing = await prisma.paymentProvider.count();
    if (existing > 0) return { skipped: true };
  }

  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

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
            {
              type: "created",
              fromStatus: null,
              toStatus: "authorized",
              amount: p.amount,
              actor: "seed",
              createdAt: p.createdAt,
            },
            ...(p.status === "captured"
              ? [
                  {
                    type: "capture",
                    fromStatus: "authorized",
                    toStatus: "captured",
                    amount: p.amount,
                    actor: "seed",
                    createdAt: p.capturedAt ?? p.createdAt,
                  },
                ]
              : []),
          ],
        },
      },
    });
  }

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
      createdAt: hoursAgo(24 * 40),
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
      createdAt: hoursAgo(24 * 12),
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
      createdAt: hoursAgo(24 * 2),
    },
  ] as const;

  for (const m of merchants) {
    await prisma.merchant.upsert({
      where: { id: m.id },
      update: {},
      create: {
        ...m,
        passwordEnc: encryptMerchantPassword(SEED_MERCHANT_PASSWORDS[m.id]),
      },
    });
  }

  return { skipped: false };
}

/** Remove all demo data (used by the demo reset endpoint and tests). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.merchant.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.paymentEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentProvider.deleteMany();
}
