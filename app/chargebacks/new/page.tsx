import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ChargebackNewView } from "@/components/views/chargeback-new-view";
import { requireMasterPage } from "@/lib/admin/page-guard";
import { DISPUTE_DEADLINE_DAYS } from "@/lib/chargebacks/types";
import { livemodeWhere, modeFromCookieStore } from "@/lib/mode";
import { partsInTz, ymd } from "@/lib/settlements/schedule";

export const dynamic = "force-dynamic";

export default async function ChargebackNewPage({ searchParams }: { searchParams?: { paymentId?: string } }) {
  await requireMasterPage();
  const mode = modeFromCookieStore(cookies());
  const rows = await prisma.payment.findMany({
    where: { ...livemodeWhere(mode), status: { in: ["captured", "partially_refunded", "refunded"] }, chargebacks: { none: { status: { in: ["received", "disputed"] } } } },
    orderBy: { capturedAt: "desc" },
    take: 200,
    select: { id: true, orderNumber: true, amount: true, merchant: { select: { siteName: true } } },
  });
  const candidates = rows.map((r) => ({ id: r.id, orderNumber: r.orderNumber, amount: r.amount, merchantName: r.merchant?.siteName ?? null }));
  const defaultDeadline = ymd(partsInTz(new Date(Date.now() + DISPUTE_DEADLINE_DAYS * 86_400_000)));
  return <ChargebackNewView candidates={candidates} initialPaymentId={searchParams?.paymentId} defaultDeadline={defaultDeadline} />;
}
