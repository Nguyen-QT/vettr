import type { ClientProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import type { ResolveGuestClientProfileInput } from "../types";

// Domain Service (CLAUDE.md Phase 16, 16.1.2): resolves the ClientProfile a
// signed-out guest booking submission attaches to. Matches by
// instagramHandle first, unchanged from submitBookingRequest's original
// by-handle upsert (a repeat guest under the same handle always has every
// field overwritten, same as before). Falls back to matching by email --
// now safe to rely on since ClientProfile.email is unique (16.1.1) -- for
// the case CLAUDE.md's Phase 16 note describes: the same person booking
// under a second Instagram handle. That reuses the existing profile
// rather than erroring, but never overwrites the handle it's already
// keyed on (it's unique -- this submission's handle belongs to nobody
// yet) or any other field already set; only fills what's still blank,
// the same posture 6.1.3/6.2 already use for a signed-in client.
export async function resolveGuestClientProfile(
  input: ResolveGuestClientProfileInput
): Promise<ClientProfile> {
  const existingByHandle = await prisma.clientProfile.findUnique({
    where: { instagramHandle: input.instagramHandle },
  });

  if (existingByHandle) {
    return prisma.clientProfile.update({
      where: { id: existingByHandle.id },
      data: {
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
      },
    });
  }

  const existingByEmail = await prisma.clientProfile.findUnique({
    where: { email: input.email },
  });

  if (existingByEmail) {
    const fillableFields: Partial<
      Pick<ClientProfile, "phone" | "firstName" | "lastName" | "dateOfBirth">
    > = {};
    if (!existingByEmail.phone && input.phone) fillableFields.phone = input.phone;
    if (!existingByEmail.firstName) fillableFields.firstName = input.firstName;
    if (!existingByEmail.lastName) fillableFields.lastName = input.lastName;
    if (!existingByEmail.dateOfBirth) fillableFields.dateOfBirth = input.dateOfBirth;

    if (Object.keys(fillableFields).length === 0) {
      return existingByEmail;
    }

    return prisma.clientProfile.update({
      where: { id: existingByEmail.id },
      data: fillableFields,
    });
  }

  return prisma.clientProfile.create({
    data: {
      instagramHandle: input.instagramHandle,
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
    },
  });
}
