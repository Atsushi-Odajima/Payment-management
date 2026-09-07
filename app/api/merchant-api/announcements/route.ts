import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { authenticateMerchantApi } from "@/lib/merchants/api-auth";
import { loadActiveAnnouncements } from "@/lib/announcements/list";

/** GET /api/merchant-api/announcements — announcements live now for the key's merchant (Bearer API key). */
export const GET = withApiHandler(
  async (req) => {
    const { key, headers } = await authenticateMerchantApi(prisma, req);
    const rows = await loadActiveAnnouncements(key.merchantId);
    return ok({ merchantCode: key.merchantCode, announcements: rows.map((a) => ({ id: a.id, kind: a.kind, title: a.title, body: a.body, publishFrom: a.publishFrom, publishUntil: a.publishUntil, updates: a.updates })) }, { headers });
  },
  { ipRestricted: false },
);
