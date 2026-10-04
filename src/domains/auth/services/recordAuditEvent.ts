import { prisma } from "@/lib/prisma";

import type { RecordAuditEventInput } from "../types";

// Single write choke point for the AuditEvent log (CLAUDE.md 27.5). Audit
// logging is a non-critical side-effect (architecture.md 8.C): this never
// throws and always resolves void, so a failed audit write can't alter the
// caller's result or control flow. Callers still `await` it so a serverless
// function doesn't terminate before the write lands.
//
// On failure only eventType/reasonCode/accountId are logged -- never
// attemptedEmail, and never the raw error (a Prisma error can echo the
// failed `data`, including the email).
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        eventType: input.eventType,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        accountId: input.accountId ?? null,
        attemptedEmail: input.attemptedEmail ?? null,
        targetRole: input.targetRole ?? null,
      },
    });
  } catch (error) {
    console.error("recordAuditEvent failed", {
      eventType: input.eventType,
      reasonCode: input.reasonCode,
      accountId: input.accountId ?? null,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
