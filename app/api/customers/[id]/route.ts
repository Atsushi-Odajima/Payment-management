import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadCustomer } from "@/lib/customers/list";

/** GET /api/customers/:id — one customer (masked) with tokens and recent transactions. */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const c = await loadCustomer(params.id, "masked");
  if (!c) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(c);
});
