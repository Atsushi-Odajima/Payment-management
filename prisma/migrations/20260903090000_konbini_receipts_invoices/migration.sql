-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "cvsBrand" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cvsPaidAt" DATETIME;
ALTER TABLE "Payment" ADD COLUMN "cvsReceiptNo" TEXT;

-- AlterTable
ALTER TABLE "SettlementLine" ADD COLUMN "taxCategory" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptNo" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "merchantId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "recipientName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'dashboard',
    "issuedById" TEXT,
    "reissueCount" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIssuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GlobalSetting" ("id", "slackWebhookUrl", "updatedAt", "viewerCsvExport") SELECT "id", "slackWebhookUrl", "updatedAt", "viewerCsvExport" FROM "GlobalSetting";
DROP TABLE "GlobalSetting";
ALTER TABLE "new_GlobalSetting" RENAME TO "GlobalSetting";
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
INSERT INTO "new_Merchant" ("agentId", "bankAccountHolder", "bankAccountNumber", "bankAccountType", "bankBranch", "bankName", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "payoutTerm", "refundWindowDays", "settlementCycle", "settlementFee", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt") SELECT "agentId", "bankAccountHolder", "bankAccountNumber", "bankAccountType", "bankBranch", "bankName", "companyName", "contactName", "createdAt", "email", "emailNotification", "enabledMethods", "id", "merchantCode", "notifyFormat", "notifyIdFormat", "notifyParamSet", "notifyUrl", "passwordEnc", "payoutTerm", "refundWindowDays", "settlementCycle", "settlementFee", "siteName", "siteNameKana", "statementEmail", "transferDueDays", "transferIdDigits", "updatedAt" FROM "Merchant";
DROP TABLE "Merchant";
ALTER TABLE "new_Merchant" RENAME TO "Merchant";
CREATE UNIQUE INDEX "Merchant_merchantCode_key" ON "Merchant"("merchantCode");
CREATE INDEX "Merchant_createdAt_idx" ON "Merchant"("createdAt");
CREATE INDEX "Merchant_agentId_idx" ON "Merchant"("agentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNo_key" ON "Receipt"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_issuedAt_idx" ON "Receipt"("merchantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_cvsReceiptNo_key" ON "Payment"("cvsReceiptNo");

