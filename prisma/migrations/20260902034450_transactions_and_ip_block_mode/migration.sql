-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IpRestriction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "merchantId" TEXT,
    "cidr" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'allow',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IpRestriction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IpRestriction" ("cidr", "createdAt", "enabled", "id", "label", "merchantId", "target", "updatedAt") SELECT "cidr", "createdAt", "enabled", "id", "label", "merchantId", "target", "updatedAt" FROM "IpRestriction";
DROP TABLE "IpRestriction";
ALTER TABLE "new_IpRestriction" RENAME TO "IpRestriction";
CREATE INDEX "IpRestriction_target_enabled_idx" ON "IpRestriction"("target", "enabled");
CREATE INDEX "IpRestriction_merchantId_idx" ON "IpRestriction"("merchantId");
CREATE TABLE "new_Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantCode" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "siteNameKana" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statementEmail" TEXT NOT NULL,
    "notifyUrl" TEXT NOT NULL,
    "notifyFormat" TEXT NOT NULL DEFAULT 'json_post',
    "notifyParamSet" TEXT NOT NULL DEFAULT 'standard',
    "notifyIdFormat" TEXT NOT NULL DEFAULT 'payment_id',
    "emailNotification" TEXT NOT NULL DEFAULT 'per_payment',
    "agentId" TEXT,
    "enabledMethods" TEXT NOT NULL DEFAULT '[]',
    "transferIdDigits" INTEGER NOT NULL DEFAULT 7,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Merchant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Merchant" ("agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "updatedAt") SELECT "agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "capturedAt" DATETIME,
    "cancelledAt" DATETIME,
    "refundedAt" DATETIME,
    CONSTRAINT "Payment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "amountRefunded", "cancelledAt", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "description", "externalId", "id", "idempotencyKey", "livemode", "metadata", "orderNumber", "providerId", "refundedAt", "status", "updatedAt") SELECT "amount", "amountRefunded", "cancelledAt", "capturedAt", "createdAt", "currency", "customerEmail", "customerName", "description", "externalId", "id", "idempotencyKey", "livemode", "metadata", "orderNumber", "providerId", "refundedAt", "status", "updatedAt" FROM "Payment";
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
CREATE UNIQUE INDEX "Payment_providerId_externalId_key" ON "Payment"("providerId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
