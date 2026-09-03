-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'monthly',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "nextChargeAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    "lastChargeAt" DATETIME,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentLink_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
INSERT INTO "new_Payment" ("amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "productName", "providerId", "refundedAt", "status", "transferDueAt", "transferId", "updatedAt") SELECT "amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "productName", "providerId", "refundedAt", "status", "transferDueAt", "transferId", "updatedAt" FROM "Payment";
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
CREATE TABLE "new_RiskSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "windowMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxFailures" INTEGER NOT NULL DEFAULT 3,
    "demoChargeFailPercent" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RiskSetting" ("id", "maxFailures", "updatedAt", "windowMinutes") SELECT "id", "maxFailures", "updatedAt", "windowMinutes" FROM "RiskSetting";
DROP TABLE "RiskSetting";
ALTER TABLE "new_RiskSetting" RENAME TO "RiskSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Plan_merchantId_idx" ON "Plan"("merchantId");

-- CreateIndex
CREATE INDEX "Subscription_status_nextChargeAt_idx" ON "Subscription"("status", "nextChargeAt");

-- CreateIndex
CREATE INDEX "Subscription_merchantId_idx" ON "Subscription"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE INDEX "PaymentLink_merchantId_status_idx" ON "PaymentLink"("merchantId", "status");
