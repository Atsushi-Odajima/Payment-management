import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadUnmatchedDeposit } from "@/lib/deposits/list";

/** GET /api/unmatched-deposits/:id — the deposit and the awaiting transfers it could belong to (exact amounts first). */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const data = await loadUnmatchedDeposit(params.id);
  if (!data) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(data);
});
