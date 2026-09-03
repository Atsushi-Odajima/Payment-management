-- AlterTable
ALTER TABLE "GlobalSetting" ADD COLUMN "slackWebhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dispatchedAt" DATETIME;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "slack" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlackLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "responseStatus" INTEGER,
    "error" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlackLog_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_adminUserId_kind_key" ON "NotificationPreference"("adminUserId", "kind");

-- CreateIndex
CREATE INDEX "SlackLog_createdAt_idx" ON "SlackLog"("createdAt");

-- CreateIndex
CREATE INDEX "SlackLog_status_idx" ON "SlackLog"("status");
