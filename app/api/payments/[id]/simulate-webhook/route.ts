import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { readCredentialsForUse } from "@/lib/providers/credentials";
import { signWebhookPayload } from "@/lib/webhooks/verify";
import { WEBHOOK_EVENT_TYPES, WEBHOOK_SIGNATURE_HEADER } from "@/lib/webhooks/events";

const Body = z.object({
  type: z.enum(WEBHOOK_EVENT_TYPES),
  amount: z.number().int().positive().optional(),
});

/**
 * POST /api/payments/:id/simulate-webhook
 *
 * Demo helper: builds a provider-style event for this payment, signs it with
 * the provider's stored webhook secret, and POSTs it to our own webhook
 * endpoint — exercising signature verification, deduplication and the state
 * machine exactly as a real PSP callback would.
 */
export const POST = withApiHandler<{ params: { id: string } }>(async (req, { params }) => {
  const body = Body.parse(await readJson(req));
  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    select: {
      externalId: true,
      provider: { select: { id: true, providerKey: true, credentials: true } },
    },
  });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (!payment.externalId) throw new ApiError(400, "no_external_id", "errors.conflict");

  const creds = readCredentialsForUse(payment.provider.providerKey, payment.provider.credentials);
  const secret = creds.webhook_secret;
  if (!secret) throw new ApiError(400, "webhook_not_configured", "errors.webhookNotConfigured");

  const eventId = `evt_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const rawBody = JSON.stringify({
    id: eventId,
    type: body.type,
    data: { externalId: payment.externalId, amount: body.amount },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, timestamp, rawBody);

  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/webhooks/${payment.provider.id}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      "x-lang": req.headers.get("x-lang") ?? "",
    },
    body: rawBody,
  });
  const downstream = (await res.json().catch(() => null)) as unknown;
  return ok({ eventId, delivered: res.ok, downstream }, { status: res.ok ? 200 : 502 });
});
