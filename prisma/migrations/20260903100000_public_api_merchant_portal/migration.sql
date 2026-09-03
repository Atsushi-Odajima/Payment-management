-- CreateTable
CREATE TABLE "ApiRateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
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
    "cvsDueDays" INTEGER NOT NULL DEFAULT 3,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "invoiceNumber" TEXT,
    "address" TEXT,
    "settlementCycle" TEXT NOT NULL DEFAULT 'monthly',
    "payoutTerm" TEXT NOT NULL DEFAULT 'next_month_end',
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountHolder" TEXT,
    "settlementFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Merchant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Merchant" ("address", "agentId", "bankAccountHolder", "bankAccountNumber", "bankAccountType", "bankBranch", "bankName", "companyName", "contactName", "createdAt", "cvsDueDays", "email", "emailNotification", "enabledMethods", "id", "invoiceNumber", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "payoutTerm", "refundWindowDays", "settlementCycle", "settlementFee", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt") SELECT "address", "agentId", "bankAccountHolder", "bankAccountNumber", "bankAccountType", "bankBranch", "bankName", "companyName", "contactName", "createdAt", "cvsDueDays", "email", "emailNotification", "enabledMethods", "id", "invoiceNumber", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "payoutTerm", "refundWindowDays", "settlementCycle", "settlementFee", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ApiRateLimit_windowStart_idx" ON "ApiRateLimit"("windowStart");

