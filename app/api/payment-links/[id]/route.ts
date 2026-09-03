import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadPaymentLink } from "@/lib/payment-links/list";

/** GET /api/payment-links/:id — link with its usage history. */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const data = await loadPaymentLink(params.id);
  if (!data) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(data);
});
