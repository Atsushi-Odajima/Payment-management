-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "to" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'demo',
    "provider" TEXT NOT NULL DEFAULT 'log',
    "error" TEXT,
    "paymentId" TEXT,
    "merchantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'notice',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishUntil" DATETIME,
    "targetAll" BOOLEAN NOT NULL DEFAULT true,
    "targetMerchantIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnnouncementUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementUpdate_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_lang_key" ON "EmailTemplate"("key", "lang");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_paymentId_idx" ON "EmailLog"("paymentId");

-- CreateIndex
CREATE INDEX "EmailLog_templateKey_status_idx" ON "EmailLog"("templateKey", "status");

-- CreateIndex
CREATE INDEX "Announcement_status_publishFrom_idx" ON "Announcement"("status", "publishFrom");

-- CreateIndex
CREATE INDEX "AnnouncementUpdate_announcementId_createdAt_idx" ON "AnnouncementUpdate"("announcementId", "createdAt");
