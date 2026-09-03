import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadChargeback } from "@/lib/chargebacks/list";

/** GET /api/chargebacks/:id */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const row = await loadChargeback(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});
