import { prisma } from "@/lib/prisma";

import type { SwitchActiveRoleResult } from "../types";
import { recordAuditEvent } from "./recordAuditEvent";

// Switching requires the account to already be linked to the target role --
// dual-role status is only ever granted explicitly via "Become a client"
// (26.1.3.1, linkOrCreateClientProfileForAccount), never implied here. A
// session can only switch into a role its account actually holds.
export async function switchActiveRole(
  sessionId: string,
  targetRole: "ARTIST" | "CLIENT"
): Promise<SwitchActiveRoleResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { account: true },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: "Session not found." };
  }

  const { artistId, clientProfileId } = session.account;

  if (targetRole === "ARTIST" && !artistId) {
    await recordAuditEvent({
      eventType: "ROLE_SWITCH",
      outcome: "REJECTED",
      reasonCode: "NOT_LINKED_TO_ARTIST",
      accountId: session.account.id,
      targetRole,
    });
    return { success: false, error: "Account is not linked to an artist profile." };
  }
  if (targetRole === "CLIENT" && !clientProfileId) {
    await recordAuditEvent({
      eventType: "ROLE_SWITCH",
      outcome: "REJECTED",
      reasonCode: "NOT_LINKED_TO_CLIENT",
      accountId: session.account.id,
      targetRole,
    });
    return { success: false, error: "Account is not linked to a client profile." };
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { activeRole: targetRole },
  });

  // After the update so only a switch that actually persisted is recorded.
  await recordAuditEvent({
    eventType: "ROLE_SWITCH",
    outcome: "SUCCESS",
    reasonCode: "ROLE_SWITCHED",
    accountId: session.account.id,
    targetRole,
  });

  return { success: true, activeRole: targetRole, artistId, clientProfileId };
}
