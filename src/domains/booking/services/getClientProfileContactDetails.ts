import { prisma } from "@/lib/prisma";

import type { ClientProfileContactDetails } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 6.1): a simple
// read of a ClientProfile's contact fields, for prefilling the booking
// form when a signed-in client starts a new booking. Returns null
// rather than throwing for an unknown id -- the caller (a server
// component) just falls back to empty defaults in that case, same as
// a signed-out visitor.
export async function getClientProfileContactDetails(
  clientProfileId: string
): Promise<ClientProfileContactDetails | null> {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: {
      instagramHandle: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
    },
  });

  return client;
}
