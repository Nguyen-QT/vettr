import { prisma } from "@/lib/prisma";

// Logout (CLAUDE.md 5.1.3). Deleting rather than expiring in place --
// a Session row only ever represents an active login.
export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
