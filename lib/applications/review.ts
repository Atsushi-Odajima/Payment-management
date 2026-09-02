// Applies a review decision to a payment application atomically.
//
// Mirrors lib/payments/actions.ts: the update is conditioned on the current
// status (pending) so two reviewers cannot both decide, and an approval
// writes the requested method into Merchant.enabledMethods in the same
// transaction.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { parseEnabledMethods } from "@/lib/merchants/types";
import {
  DECISIONS_REQUIRING_REASON,
  DECISION_TO_STATUS,
  type ApplicationStatus,
  type ReviewDecision,
} from "./types";

export interface ReviewInput {
  applicationId: string;
  decision: ReviewDecision;
  reason: string | null;
}

export interface ReviewResult {
  id: string;
  status: ApplicationStatus;
  reviewedAt: Date;
  enabledMethods: string[];
}

export async function reviewApplication(prisma: PrismaClient, input: ReviewInput): Promise<ReviewResult> {
  const { applicationId, decision } = input;
  const reason = input.reason?.trim() || null;
  if (DECISIONS_REQUIRING_REASON.includes(decision) && !reason) {
    throw new ApiError(400, "reason_required", "errors.reasonRequired");
  }

  const app = await prisma.paymentApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, method: true, merchantId: true },
  });
  if (!app) throw new ApiError(404, "not_found", "errors.notFound");
  if (app.status !== "pending") throw new ApiError(409, "already_reviewed", "errors.alreadyReviewed");

  const nextStatus = DECISION_TO_STATUS[decision];
  const reviewedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.paymentApplication.updateMany({
      where: { id: applicationId, status: "pending" },
      data: { status: nextStatus, reviewedAt, reviewerNote: reason },
    });
    if (updated.count === 0) throw new ApiError(409, "already_reviewed", "errors.alreadyReviewed");

    let enabledMethods: string[] = [];
    const merchant = await tx.merchant.findUniqueOrThrow({
      where: { id: app.merchantId },
      select: { enabledMethods: true },
    });
    enabledMethods = parseEnabledMethods(merchant.enabledMethods);
    if (decision === "approve" && !enabledMethods.includes(app.method)) {
      enabledMethods = [...enabledMethods, app.method];
      await tx.merchant.update({
        where: { id: app.merchantId },
        data: { enabledMethods: JSON.stringify(enabledMethods) },
      });
    }
    return { id: applicationId, status: nextStatus, reviewedAt, enabledMethods };
  });
}
