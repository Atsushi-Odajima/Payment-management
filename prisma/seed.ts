import { PrismaClient } from "@prisma/client";
import { encrypt } from "../lib/crypto";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.paymentProvider.count();
  if (existing > 0) {
    console.log("Already seeded — skipping.");
    return;
  }

  const stripe = await prisma.paymentProvider.create({
    data: {
      providerKey: "stripe",
      category: "credit",
      displayName: "本店 (Stripe)",
      testMode: true,
      credentials: JSON.stringify({
        publishable_key: "pk_test_seedDemoPublishableKey1234",
        secret_key: encrypt("sk_test_seedDemoSecretKey5678abcd"),
        statement_descriptor: "MYSTORE",
      }),
    },
  });

  const paypay = await prisma.paymentProvider.create({
    data: {
      providerKey: "paypay",
      category: "qr",
      displayName: "本店 (PayPay)",
      testMode: true,
      credentials: JSON.stringify({
        merchant_id: "M-SEED-0001",
        api_key: "API_KEY_SEED",
        api_secret: encrypt("SECRET_SEED_VALUE"),
      }),
    },
  });

  const now = Date.now();
  await prisma.payment.createMany({
    data: [
      {
        providerId: stripe.id,
        orderNumber: "ORD-DEMO-001",
        amount: 4980,
        status: "captured",
        externalId: "stripe_demo_001",
        customerName: "山田 太郎",
        customerEmail: "taro@example.com",
        description: "春物ジャケット",
        capturedAt: new Date(now - 1000 * 60 * 60 * 6),
      },
      {
        providerId: paypay.id,
        orderNumber: "ORD-DEMO-002",
        amount: 1280,
        status: "captured",
        externalId: "paypay_demo_002",
        customerName: "鈴木 花子",
        description: "ロゴTシャツ",
        capturedAt: new Date(now - 1000 * 60 * 60 * 3),
      },
      {
        providerId: stripe.id,
        orderNumber: "ORD-DEMO-003",
        amount: 9800,
        status: "authorized",
        externalId: "stripe_demo_003",
        customerName: "佐藤 次郎",
        description: "ハンドメイドバッグ",
      },
    ],
  });

  console.log("Seed complete: 2 providers, 3 payments.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
