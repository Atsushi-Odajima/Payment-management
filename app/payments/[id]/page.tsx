import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { PaymentActions } from "@/components/payment-actions";
import { getProviderDefinition } from "@/lib/providers/registry";
import {
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
  cn,
  formatDateTime,
  formatYen,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { provider: true },
  });
  if (!payment) notFound();
  const def = getProviderDefinition(payment.provider.providerKey);

  return (
    <div>
      <PageHeader
        title={`決済 ${payment.orderNumber}`}
        description={`${def?.name ?? payment.provider.providerKey} ・ ${payment.provider.displayName}`}
        breadcrumbs={[
          { label: "売上 / 決済一覧", href: "/payments" },
          { label: payment.orderNumber },
        ]}
        actions={
          <span
            className={cn(
              "badge",
              PAYMENT_STATUS_COLOR[payment.status] ??
                "bg-slate-100 text-slate-700 ring-slate-200",
            )}
          >
            {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card divide-y divide-slate-100">
          <Row label="金額">
            <span className="text-lg font-semibold tabular-nums">
              {formatYen(payment.amount)}
            </span>
          </Row>
          <Row label="決済プロバイダ">
            <Link
              href={`/providers/${payment.provider.id}`}
              className="text-brand-700 hover:underline"
            >
              {payment.provider.displayName}
            </Link>
            <span className="ml-2 text-xs text-slate-500">
              ({def?.name ?? payment.provider.providerKey})
            </span>
          </Row>
          <Row label="モード">
            <span
              className={cn(
                "badge",
                payment.provider.testMode
                  ? "bg-amber-100 text-amber-800 ring-amber-200"
                  : "bg-emerald-100 text-emerald-800 ring-emerald-200",
              )}
            >
              {payment.provider.testMode ? "テスト" : "本番"}
            </span>
          </Row>
          <Row label="外部ID">
            <span className="font-mono text-xs">{payment.externalId ?? "—"}</span>
          </Row>
          <Row label="顧客">
            <div>
              {payment.customerName ?? "—"}
              {payment.customerEmail && (
                <p className="text-xs text-slate-500">{payment.customerEmail}</p>
              )}
            </div>
          </Row>
          <Row label="メモ">
            <span className="whitespace-pre-wrap text-sm">
              {payment.description || "—"}
            </span>
          </Row>
          <Row label="作成日時">{formatDateTime(payment.createdAt)}</Row>
          {payment.capturedAt && (
            <Row label="売上確定">{formatDateTime(payment.capturedAt)}</Row>
          )}
          {payment.cancelledAt && (
            <Row label="取消日時">{formatDateTime(payment.cancelledAt)}</Row>
          )}
          {payment.refundedAt && (
            <Row label="返金日時">{formatDateTime(payment.refundedAt)}</Row>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              操作
            </p>
            <div className="mt-3">
              <PaymentActions id={payment.id} status={payment.status} />
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">デモ環境について</p>
            <p className="mt-1">
              キャプチャ・取消・返金はDB上の状態のみ更新されます。
              本番化する際は、各プロバイダのSDK呼び出しを <code>lib/providers/connection.ts</code> に追加してください。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-3 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  );
}
