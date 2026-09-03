-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantId" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "periodFrom" DATETIME NOT NULL,
    "periodTo" DATETIME NOT NULL,
    "grossAmount" INTEGER NOT NULL DEFAULT 0,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "chargebackAmount" INTEGER NOT NULL DEFAULT 0,
    "settlementFee" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "scheduledAt" DATETIME,
    "paidAt" DATETIME,
    "holdReason" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SettlementBatch_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentId" TEXT,
    "refundId" TEXT,
    "chargebackId" TEXT,
    "method" TEXT,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" DATETIME NOT NULL,
    CONSTRAINT "SettlementLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
INSERT INTO "new_Merchant" ("agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "refundWindowDays", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt") SELECT "agentId", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "refundWindowDays", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SettlementBatch_status_scheduledAt_idx" ON "SettlementBatch"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SettlementBatch_merchantId_createdAt_idx" ON "SettlementBatch"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_merchantId_livemode_periodFrom_periodTo_key" ON "SettlementBatch"("merchantId", "livemode", "periodFrom", "periodTo");

-- CreateIndex
CREATE INDEX "SettlementLine_batchId_idx" ON "SettlementLine"("batchId");
