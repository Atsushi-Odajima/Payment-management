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
  if (payment.status !== "pending" && payment.status !== "authorized") {
    return NextResponse.json(
      { error: "この決済はキャプチャできない状態です" },
      { status: 400 },
    );
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "captured", capturedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
