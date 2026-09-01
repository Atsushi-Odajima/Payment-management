import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { langFromRequest, translate } from "@/lib/i18n";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const lang = langFromRequest(req);
  const payment = await prisma.payment.findUnique({ where: { id: params.id } });
  if (!payment) {
    return NextResponse.json({ error: translate(lang, "errors.notFound") }, { status: 404 });
  }
  if (payment.status !== "pending" && payment.status !== "authorized") {
    return NextResponse.json(
      { error: translate(lang, "errors.cannotCapture") },
      { status: 400 },
    );
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "captured", capturedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
