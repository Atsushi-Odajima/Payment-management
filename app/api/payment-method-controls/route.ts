import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { requirePermission } from "@/lib/api/role-guard";
import { auditContextFromRequest } from "@/lib/audit";
import { loadGlobalControls, loadMerchantControls, methodControlInputSchema, setMethodControl } from "@/lib/payments/method-controls";

/** GET /api/payment-method-controls[?merchantId=] — the global switches, plus the merchant's when given. */
export const GET = withApiHandler(async (req) => {
  const merchantId = new URL(req.url).searchParams.get("merchantId");
  if (merchantId) return ok(await loadMerchantControls(prisma, merchantId));
  return ok({ global: await loadGlobalControls(prisma) });
});

/**
 * PUT /api/payment-method-controls — suspend / resume one switch.
 * Global switches: admin only. Merchant switches: admin and cs. A suspension
 * needs a reason, is audited and raises a notification (critical when global).
 */
export const PUT = withApiHandler(async (req) => {
  const parsed = methodControlInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }
  const admin = await requirePermission(req, "payment_method_control", parsed.data.scope === "global" ? "suspend_global" : "suspend_merchant");
  const row = await setMethodControl(prisma, { input: parsed.data, actorId: admin.id, audit: await auditContextFromRequest(req) });
  return ok(row);
});
