import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadWebhookDelivery } from "@/lib/webhooks/list";

/** GET /api/webhook-logs/:id — request, last response and every attempt. */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const row = await loadWebhookDelivery(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});
