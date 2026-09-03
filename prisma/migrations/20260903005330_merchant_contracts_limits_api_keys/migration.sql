-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "failureReason" TEXT;

-- CreateTable
CREATE TABLE "MerchantFeeSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "rates" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantFeeSchedule_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MerchantLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "perTransaction" INTEGER,
    "daily" INTEGER,
    "monthly" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantLimit_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "transferDueDays" INTEGER NOT NULL DEFAULT 7,
    "refundWindowDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Merchant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Merchant" ("agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "transferIdDigits", "updatedAt") SELECT "agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "siteName", "siteNameKana", "statementEmail", "transferIdDigits", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MerchantFeeSchedule_merchantId_effectiveFrom_idx" ON "MerchantFeeSchedule"("merchantId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantLimit_merchantId_method_key" ON "MerchantLimit"("merchantId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_mode_kind_idx" ON "ApiKey"("merchantId", "mode", "kind");
