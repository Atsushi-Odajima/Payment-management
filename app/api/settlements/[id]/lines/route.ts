import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { csvResponse, toCsv } from "@/lib/csv";
import { loadSettlement } from "@/lib/settlements/list";

/** GET /api/settlements/:id/lines — the batch's lines; `?format=csv` exports them. */
export const GET = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const data = await loadSettlement(params.id);
  if (!data) throw new ApiError(404, "not_found", "errors.notFound");
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return csvResponse(
      toCsv(data.lines, [
        { header: "occurredAt", value: (l) => l.occurredAt },
        { header: "kind", value: (l) => l.kind },
        { header: "orderNumber", value: (l) => l.description },
        { header: "paymentId", value: (l) => l.paymentId },
        { header: "refundId", value: (l) => l.refundId },
        { header: "chargebackId", value: (l) => l.chargebackId },
        { header: "method", value: (l) => l.method },
        { header: "amount", value: (l) => l.amount },
        { header: "fee", value: (l) => l.fee },
      ]),
      `settlement-${data.batch.merchant.merchantCode}-${data.batch.id}.csv`,
      data.batch.livemode ? "live" : "test",
    );
  }
  return ok(data.lines);
});
