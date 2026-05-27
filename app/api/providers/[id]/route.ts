import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { getProviderDefinition } from "@/lib/providers/registry";

const UpdateSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  testMode: z.boolean().optional(),
  credentials: z.record(z.string(), z.string().optional()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力に誤りがあります" }, { status: 400 });
  }
  const existing = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const def = getProviderDefinition(existing.providerKey);
  if (!def) {
    return NextResponse.json({ error: "未対応のプロバイダです" }, { status: 400 });
  }

  // merge credentials: empty secret fields keep existing ciphertext.
  const current = safeJsonObject(existing.credentials);
  const incoming = parsed.data.credentials ?? {};
  const merged: Record<string, string> = { ...current };
  for (const field of def.fields) {
    const raw = incoming[field.key];
    if (raw === undefined) continue;
    if (raw === "" || raw == null) {
      if (!field.secret) {
        delete merged[field.key];
      }
      // for secret fields: empty => keep existing
      continue;
    }
    merged[field.key] = field.secret ? encrypt(raw) : raw;
  }

  const updated = await prisma.paymentProvider.update({
    where: { id: params.id },
    data: {
      displayName: parsed.data.displayName ?? existing.displayName,
      status: parsed.data.status ?? existing.status,
      testMode: parsed.data.testMode ?? existing.testMode,
      credentials: JSON.stringify(merged),
    },
  });
  return NextResponse.json({ id: updated.id });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.paymentProvider.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

function safeJsonObject(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
