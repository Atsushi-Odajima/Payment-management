import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readCredentialsForUse } from "@/lib/providers/credentials";
import { runConnectionTest } from "@/lib/providers/connection";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const record = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
  });
  if (!record) {
    return NextResponse.json(
      { ok: false, message: "プロバイダが見つかりません" },
      { status: 404 },
    );
  }
  const creds = readCredentialsForUse(record.providerKey, record.credentials);
  const result = runConnectionTest(record.providerKey, creds, record.testMode);
  await prisma.paymentProvider.update({
    where: { id: record.id },
    data: { lastTestAt: new Date(), lastTestOk: result.ok },
  });
  return NextResponse.json(result);
}
