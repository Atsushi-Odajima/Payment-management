import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildCredentialStore } from "@/lib/providers/credentials";
import { getProviderDefinition } from "@/lib/providers/registry";
import { langFromRequest, pickText, translate } from "@/lib/i18n";

const CreateSchema = z.object({
  providerKey: z.string().min(1),
  displayName: z.string().min(1).max(80),
  testMode: z.boolean().default(true),
  credentials: z.record(z.string(), z.string().optional()).default({}),
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
  const def = getProviderDefinition(parsed.data.providerKey);
  if (!def) {
    return NextResponse.json(
      { error: translate(lang, "errors.unsupportedProvider") },
      { status: 400 },
    );
  }

  for (const field of def.fields) {
    if (field.required && !parsed.data.credentials[field.key]) {
      return NextResponse.json(
        { error: translate(lang, "errors.missingRequired", { fields: pickText(field.label, lang) }) },
        { status: 400 },
      );
    }
  }

  const store = buildCredentialStore(def.key, parsed.data.credentials);
  const record = await prisma.paymentProvider.create({
    data: {
      providerKey: def.key,
      category: def.category,
      displayName: parsed.data.displayName,
      credentials: JSON.stringify(store),
      testMode: parsed.data.testMode,
    },
  });
  return NextResponse.json({ id: record.id });
}

export async function GET() {
  const providers = await prisma.paymentProvider.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      providerKey: true,
      category: true,
      displayName: true,
      status: true,
      testMode: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ providers });
}
