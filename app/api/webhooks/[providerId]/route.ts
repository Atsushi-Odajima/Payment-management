import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { readCredentialsForUse } from "@/lib/providers/credentials";
import { applyPaymentAction } from "@/lib/payments/actions";
import { requestIp, systemAuditContext } from "@/lib/audit";
import { verifyWebhookSignature } from "@/lib/webhooks/verify";
import {
  EVENT_TO_ACTION,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_SIGNATURE_HEADER,
} from "@/lib/webhooks/events";

const EventSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(WEBHOOK_EVENT_TYPES),
  data: z.object({
    externalId: z.string().min(1),
    amount: z.number().int().positive().optional(),
  }),
});

/**
 * POST /api/webhooks/:providerId
 *
 * Authenticated by HMAC signature (not by session): the raw body is verified
 * against the provider's stored webhook secret, replayed events are dropped
 * via the (providerId, externalEventId) unique constraint, and the mapped
 * action is applied through the same state machine as the dashboard.
 */
export const POST = withApiHandler<{ params: { providerId: string } }>(
  async (req, { params }) => {
    const provider = await prisma.paymentProvider.findUnique({
      where: { id: params.providerId },
      select: { id: true, providerKey: true, credentials: true },
    });
    if (!provider) throw new ApiError(404, "provider_not_found", "errors.providerNotFound");

    const creds = readCredentialsForUse(provider.providerKey, provider.credentials);
    const secret = creds.webhook_secret;
    if (!secret) throw new ApiError(400, "webhook_not_configured", "errors.webhookNotConfigured");

    const rawBody = await req.text();
    const verdict = verifyWebhookSignature(secret, req.headers.get(WEBHOOK_SIGNATURE_HEADER), rawBody);
    if (!verdict.ok) {
      throw new ApiError(400, `signature_${verdict.reason}`, "errors.invalidSignature");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new ApiError(400, "invalid_json", "errors.invalidInput");
    }
    const event = EventSchema.parse(parsed);

    // Deduplicate: a second delivery of the same event id is acknowledged, not
    // re-applied. The unique constraint is the real guard (two deliveries can
    // race); the pre-check just keeps the common case quiet.
    const seen = await prisma.webhookEvent.findUnique({
      where: { providerId_externalEventId: { providerId: provider.id, externalEventId: event.id } },
      select: { id: true },
    });
    if (seen) return ok({ received: true, duplicate: true });
    let stored;
    try {
      stored = await prisma.webhookEvent.create({
        data: {
          providerId: provider.id,
          externalEventId: event.id,
          type: event.type,
          payload: rawBody,
        },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return ok({ received: true, duplicate: true });
      }
      throw err;
    }

    const payment = await prisma.payment.findUnique({
      where: { providerId_externalId: { providerId: provider.id, externalId: event.data.externalId } },
      select: { id: true },
    });
    if (!payment) {
      await prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date(), error: "payment_not_found" },
      });
      throw new ApiError(404, "not_found", "errors.notFound");
    }

    try {
      const result = await applyPaymentAction(prisma, {
        paymentId: payment.id,
        action: EVENT_TO_ACTION[event.type],
        amount: event.data.amount,
        actor: "webhook",
        audit: systemAuditContext("webhook", requestIp(req)),
      });
      await prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date() },
      });
      return ok({ received: true, duplicate: false, payment: result });
    } catch (err) {
      await prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date(), error: err instanceof Error ? err.message : "error" },
      });
      throw err;
    }
  },
  // PSP callbacks are not admin traffic; the admin IP block list does not apply.
  { ipRestricted: false },
);
