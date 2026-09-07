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
    "ipAllowlistAdmin" BOOLEAN NOT NULL DEFAULT false,
    "ipAllowlistMerchantApi" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GlobalSetting" ("auditRetentionYears", "csvPii", "id", "issuerAddress", "issuerName", "issuerRegistrationNo", "issuerTel", "piiRetentionMonths", "slackWebhookUrl", "taxRounding", "updatedAt", "viewerCsvExport") SELECT "auditRetentionYears", "csvPii", "id", "issuerAddress", "issuerName", "issuerRegistrationNo", "issuerTel", "piiRetentionMonths", "slackWebhookUrl", "taxRounding", "updatedAt", "viewerCsvExport" FROM "GlobalSetting";
DROP TABLE "GlobalSetting";
ALTER TABLE "new_GlobalSetting" RENAME TO "GlobalSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

