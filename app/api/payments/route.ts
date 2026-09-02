import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { initialStatus } from "@/lib/payments/transitions";
import { DEMO_LIMITS } from "@/lib/demo";

const CreateSchema = z.object({
  providerId: z.string().min(1),
  orderNumber: z.string().min(1).max(64),
  amount: z.number().int().positive().max(99_999_999),
  // JPY only — the dashboard formats everything as yen.
  currency: z.literal("JPY").default("JPY"),
  customerName: z.string().max(120).nullable().optional(),
  customerEmail: z.string().email().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  autoCapture: z.boolean().default(true),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const POST = withApiHandler(async (req) => {
  const body = CreateSchema.parse(await readJson(req));
  const idempotencyKey = req.headers.get("idempotency-key") ?? body.idempotencyKey;

  // Idempotent replay: same key → same result, no second payment.
  if (idempotencyKey) {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey },
      select: { id: true, externalId: true },
    });
    if (existing) return ok({ ...existing, replayed: true });
  }

  const provider = await prisma.paymentProvider.findUnique({
    where: { id: body.providerId },
    select: { id: true, providerKey: true, category: true, status: true, testMode: true },
  });
  if (!provider) throw new ApiError(404, "provider_not_found", "errors.providerNotFound");
  if (provider.status !== "active") {
    throw new ApiError(400, "provider_disabled", "errors.providerDisabled");
  }

  const count = await prisma.payment.count();
  if (count >= DEMO_LIMITS.payments) {
    throw new ApiError(403, "demo_limit", "errors.demoLimit", { limit: DEMO_LIMITS.payments });
  }

  const status = initialStatus(provider.category, body.autoCapture);
  const now = new Date();
  const externalId = generateDemoExternalId(provider.providerKey);

  const payment = await prisma.payment.create({
    data: {
      providerId: provider.id,
      orderNumber: body.orderNumber,
      amount: body.amount,
      currency: body.currency,
      customerName: body.customerName ?? null,
      customerEmail: body.customerEmail ?? null,
      description: body.description ?? null,
      externalId,
      status,
      livemode: !provider.testMode,
      idempotencyKey: idempotencyKey ?? null,
      capturedAt: status === "captured" ? now : null,
      events: {
        create: [
          {
            type: "created",
            fromStatus: null,
            toStatus: status === "captured" ? "authorized" : status,
            amount: body.amount,
            actor: "dashboard",
          },
          ...(status === "captured"
            ? [
                {
                  type: "capture",
                  fromStatus: "authorized",
                  toStatus: "captured",
                  amount: body.amount,
                  actor: "dashboard" as const,
                },
              ]
            : []),
        ],
      },
    },
    select: { id: true, externalId: true },
  });
  return ok({ ...payment, replayed: false }, { status: 201 });
});

function generateDemoExternalId(prefixKey: string): string {
  const prefix = prefixKey.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix || "demo"}_${ts}_${rand}`;
}
