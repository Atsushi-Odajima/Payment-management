import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { clientIpFromHeaders } from "@/lib/ip";
import { loadPublicLink } from "@/lib/payment-links/list";
import { checkoutFromLink, checkoutMethods } from "@/lib/payment-links/service";
import { linkCheckoutSchema } from "@/lib/payment-links/types";

type Ctx = { params: { token: string } };

/** GET /api/pay/:token — public: what the hosted page shows (product, amount, available methods). */
export const GET = withApiHandler<Ctx>(
  async (_req, { params }) => {
    const link = await loadPublicLink(params.token);
    if (!link) throw new ApiError(404, "not_found", "errors.notFound");
    const raw = await prisma.paymentLink.findUnique({ where: { token: params.token }, select: { livemode: true, merchant: { select: { id: true, enabledMethods: true } } } });
    const methods = raw ? (await checkoutMethods(prisma, raw)).map((m) => m.method) : [];
    return ok({ productName: link.productName, amount: link.amount, description: link.description, merchant: link.merchant.siteName, unavailable: link.unavailable, methods, livemode: link.livemode });
  },
  { ipRestricted: false },
);

/** POST /api/pay/:token — public checkout: creates the transaction for the link. */
export const POST = withApiHandler<Ctx>(
  async (req, { params }) => {
    const parsed = linkCheckoutSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
    }
    const result = await checkoutFromLink(prisma, { token: params.token, input: parsed.data, clientIp: clientIpFromHeaders((n) => req.headers.get(n)) });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: result.payment.id }, select: { id: true, status: true, amount: true, transferId: true, transferDueAt: true, cvsBrand: true, cvsReceiptNo: true, method: true, orderNumber: true } });
    return ok({ payment, method: result.method }, { status: 201 });
  },
  { ipRestricted: false },
);
