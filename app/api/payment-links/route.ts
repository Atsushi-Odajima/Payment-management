import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { resolveMode } from "@/lib/mode";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { loadPaymentLinks, parsePaymentLinkFilters, parsePaymentLinkSort, toPaymentLinkRow } from "@/lib/payment-links/list";
import { createPaymentLink } from "@/lib/payment-links/service";
import { paymentLinkInputSchema } from "@/lib/payment-links/types";

/** GET /api/payment-links — links for the mode. */
export const GET = withApiHandler(async (req) => {
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const page = parsePage(q.page);
  const { rows, total } = await loadPaymentLinks({ filters: parsePaymentLinkFilters(q, resolveMode(q.mode)), sort: parsePaymentLinkSort(q), page, pageSize: DEFAULT_PAGE_SIZE });
  return ok({ links: rows, total, page, pageSize: DEFAULT_PAGE_SIZE });
});

/** POST /api/payment-links — issue a link (mode from `?mode=` or the cookie). */
export const POST = withApiHandler(async (req) => {
  const admin = await requirePermission(req, "payment_link", "create");
  const parsed = paymentLinkInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const modeParam = new URL(req.url).searchParams.get("mode");
  const cookieMode = req.headers.get("cookie")?.match(/(?:^|;\s*)wirepay\.mode=(test|live)/)?.[1];
  const row = await createPaymentLink(prisma, { input: parsed.data, livemode: resolveMode(modeParam ?? cookieMode) === "live", actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(toPaymentLinkRow(row), { status: 201 });
});
