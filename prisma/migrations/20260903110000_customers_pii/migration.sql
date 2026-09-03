-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "anonymizedAt" DATETIME,
    "anonymizeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "cardHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "PaymentToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnonymizeBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "customers" INTEGER NOT NULL DEFAULT 0,
    "payments" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "auditLogs" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "actorId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GlobalSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "viewerCsvExport" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "issuerName" TEXT,
    "issuerRegistrationNo" TEXT,
    "issuerAddress" TEXT,
    "issuerTel" TEXT,
    "taxRounding" TEXT NOT NULL DEFAULT 'floor',
    "piiRetentionMonths" INTEGER NOT NULL DEFAULT 24,
    "auditRetentionYears" INTEGER NOT NULL DEFAULT 7,
    "csvPii" TEXT NOT NULL DEFAULT 'masked',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GlobalSetting" ("id", "issuerAddress", "issuerName", "issuerRegistrationNo", "issuerTel", "slackWebhookUrl", "taxRounding", "updatedAt", "viewerCsvExport") SELECT "id", "issuerAddress", "issuerName", "issuerRegistrationNo", "issuerTel", "slackWebhookUrl", "taxRounding", "updatedAt", "viewerCsvExport" FROM "GlobalSetting";
DROP TABLE "GlobalSetting";
ALTER TABLE "new_GlobalSetting" RENAME TO "GlobalSetting";
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
    "cvsBrand" TEXT,
    "cvsReceiptNo" TEXT,
    "cvsPaidAt" DATETIME,
    "customerRef" TEXT,
    "subscriptionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "capturedAt" DATETIME,
    "cancelledAt" DATETIME,
    "refundedAt" DATETIME,
    CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_customerRef_fkey" FOREIGN KEY ("customerRef") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "cvsBrand", "cvsPaidAt", "cvsReceiptNo", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "paymentLinkId", "productName", "providerId", "refundedAt", "renotifiedAt", "renotifyCount", "status", "subscriptionId", "transferDueAt", "transferId", "updatedAt") SELECT "amount", "amountRefunded", "cancelledAt", "capturedAt", "cardHash", "cardLast4", "clientIp", "createdAt", "currency", "customerEmail", "customerId", "customerName", "cvsBrand", "cvsPaidAt", "cvsReceiptNo", "depositAmount", "depositDiff", "depositDiffStatus", "description", "externalId", "failureReason", "id", "idempotencyKey", "livemode", "merchantId", "metadata", "method", "orderNumber", "paymentLinkId", "productName", "providerId", "refundedAt", "renotifiedAt", "renotifyCount", "status", "subscriptionId", "transferDueAt", "transferId", "updatedAt" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_transferId_key" ON "Payment"("transferId");
CREATE UNIQUE INDEX "Payment_cvsReceiptNo_key" ON "Payment"("cvsReceiptNo");
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
CREATE INDEX "Customer_merchantId_createdAt_idx" ON "Customer"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_externalId_key" ON "Customer"("merchantId", "externalId");

-- CreateIndex
CREATE INDEX "PaymentToken_customerId_idx" ON "PaymentToken"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentToken_customerId_cardHash_key" ON "PaymentToken"("customerId", "cardHash");

-- CreateIndex
CREATE INDEX "AnonymizeBatch_startedAt_idx" ON "AnonymizeBatch"("startedAt");

