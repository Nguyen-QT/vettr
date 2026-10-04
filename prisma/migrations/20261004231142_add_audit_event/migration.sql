-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('LOGIN_FAILED', 'ROLE_SWITCH', 'CLIENT_PROFILE_LINK');

-- CreateEnum
CREATE TYPE "AuditEventOutcome" AS ENUM ('SUCCESS', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditReasonCode" AS ENUM ('ACCOUNT_NOT_FOUND', 'ROLE_MISMATCH', 'INVALID_PASSWORD', 'NOT_LINKED_TO_ARTIST', 'NOT_LINKED_TO_CLIENT', 'ROLE_SWITCHED', 'ALREADY_HAS_CLIENT_PROFILE', 'CLIENT_PROFILE_ALREADY_LINKED', 'CLIENT_PROFILE_CREATED', 'CLIENT_PROFILE_MATCHED_EXISTING');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "AuditEventType" NOT NULL,
    "outcome" "AuditEventOutcome" NOT NULL,
    "reasonCode" "AuditReasonCode" NOT NULL,
    "accountId" TEXT,
    "attemptedEmail" TEXT,
    "targetRole" "AccountRole",

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_accountId_createdAt_idx" ON "AuditEvent"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
