import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadSubscription } from "@/lib/subscriptions/list";

/** GET /api/subscriptions/:id — subscription with its charge history. */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const data = await loadSubscription(params.id);
  if (!data) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(data);
});
