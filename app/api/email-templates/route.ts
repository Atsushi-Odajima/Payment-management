import { ok, withApiHandler } from "@/lib/api/handler";
import { loadEmailTemplates } from "@/lib/email/list";

/** GET /api/email-templates — every template (key × language). */
export const GET = withApiHandler(async () => ok({ templates: await loadEmailTemplates() }));
