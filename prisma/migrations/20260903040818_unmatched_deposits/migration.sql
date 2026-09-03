-- CreateTable
CREATE TABLE "UnmatchedDeposit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "amount" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "bankReference" TEXT,
    "givenTransferId" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "paymentId" TEXT,
    "matchedTransferId" TEXT,
    "matchedById" TEXT,
    "matchedAt" DATETIME,
    "dismissReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnmatchedDeposit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "amountRefunded" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "description" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "merchantId" TEXT,
    "method" TEXT,
    "productName" TEXT,
    "customerId" TEXT,
    "transferId" TEXT,
    "transferDueAt" DATETIME,
    "depositAmount" INTEGER,
    "depositDiff" TEXT,
    "failureReason" TEXT,
    "cardHash" TEXT,
    "cardLast4" TEXT,
    "clientIp" TEXT,
    "depositDiffStatus" TEXT,
    "paymentLinkId" TEXT,
    "renotifiedAt" DATETIME,
    "renotifyCount" INTEGER NOT NULL DEFAULT 0,
    "subscriptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "capturedAt" DATETIME,
    "cancelledAt" DATETIME,
    "refundedAt" DATETIME,
    CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "paymentLinkId", "productName", "providerId", "refundedAt", "status", "subscriptionId", "transferDueAt", "transferId", "updatedAt") SELECT "amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "paymentLinkId", "productName", "providerId", "refundedAt", "status", "subscriptionId", "transferDueAt", "transferId", "updatedAt" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_transferId_key" ON "Payment"("transferId");
CREATE INDEX "Payment_providerId_idx" ON "Payment"("providerId");
CREATE INDEX "Payment_merchantId_idx" ON "Payment"("merchantId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "Payment_transferDueAt_idx" ON "Payment"("transferDueAt");
CREATE INDEX "Payment_livemode_idx" ON "Payment"("livemode");
CREATE INDEX "Payment_cardHash_idx" ON "Payment"("cardHash");
CREATE INDEX "Payment_clientIp_idx" ON "Payment"("clientIp");
CREATE INDEX "Payment_depositDiffStatus_idx" ON "Payment"("depositDiffStatus");
CREATE INDEX "Payment_paymentLinkId_idx" ON "Payment"("paymentLinkId");
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE UNIQUE INDEX "Payment_providerId_externalId_key" ON "Payment"("providerId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UnmatchedDeposit_status_idx" ON "UnmatchedDeposit"("status");

-- CreateIndex
CREATE INDEX "UnmatchedDeposit_livemode_idx" ON "UnmatchedDeposit"("livemode");

-- CreateIndex
CREATE INDEX "UnmatchedDeposit_receivedAt_idx" ON "UnmatchedDeposit"("receivedAt");

-- CreateIndex
CREATE INDEX "UnmatchedDeposit_paymentId_idx" ON "UnmatchedDeposit"("paymentId");
