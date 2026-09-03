-- CreateTable
CREATE TABLE "Chargeback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'received',
    "disputeDeadlineAt" DATETIME,
    "evidenceNote" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chargeback_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Chargeback_paymentId_idx" ON "Chargeback"("paymentId");

-- CreateIndex
CREATE INDEX "Chargeback_status_disputeDeadlineAt_idx" ON "Chargeback"("status", "disputeDeadlineAt");

-- CreateIndex
CREATE INDEX "Chargeback_merchantId_idx" ON "Chargeback"("merchantId");
