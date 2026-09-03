import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { loadEmailLog } from "@/lib/email/list";

/** GET /api/email-logs/:id — the rendered email. */
export const GET = withApiHandler<{ params: { id: string } }>(async (_req, { params }) => {
  const row = await loadEmailLog(params.id);
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  return ok(row);
});
