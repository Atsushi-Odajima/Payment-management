import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const payment = await prisma.payment.findUnique({ where: { id: params.id } });
  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payment.status !== "captured") {
    return NextResponse.json(
      { error: "売上確定後の決済のみ返金できます" },
      { status: 400 },
    );
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "refunded", refundedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
