import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getProviderDefinition } from "@/lib/providers/registry";
import { langFromRequest, translate } from "@/lib/i18n";

const CreateSchema = z.object({
  providerId: z.string().min(1),
  orderNumber: z.string().min(1).max(64),
  amount: z.number().int().positive().max(99_999_999),
  currency: z.string().length(3).default("JPY"),
  customerName: z.string().max(120).nullable().optional(),
  customerEmail: z.string().email().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  autoCapture: z.boolean().default(true),
});

export async function POST(req: Request) {
  const lang = langFromRequest(req);
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: translate(lang, "errors.invalidInput"), details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const provider = await prisma.paymentProvider.findUnique({
    where: { id: parsed.data.providerId },
  });
  if (!provider) {
    return NextResponse.json(
      { error: translate(lang, "errors.providerNotFound") },
      { status: 404 },
    );
  }
  if (provider.status !== "active") {
    return NextResponse.json(
      { error: translate(lang, "errors.providerDisabled") },
      { status: 400 },
    );
  }
  const def = getProviderDefinition(provider.providerKey);
  const now = new Date();
  const externalId = generateDemoExternalId(def?.key ?? provider.providerKey);

  const payment = await prisma.payment.create({
    data: {
      providerId: provider.id,
      orderNumber: parsed.data.orderNumber,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      customerName: parsed.data.customerName ?? null,
      customerEmail: parsed.data.customerEmail ?? null,
      description: parsed.data.description ?? null,
      externalId,
      status: parsed.data.autoCapture ? "captured" : "authorized",
      capturedAt: parsed.data.autoCapture ? now : null,
    },
  });
  return NextResponse.json({ id: payment.id, externalId });
}

function generateDemoExternalId(prefixKey: string): string {
  const prefix = prefixKey.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix || "demo"}_${ts}_${rand}`;
}
