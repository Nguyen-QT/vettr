import type { ClientProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
  CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
} from "../constants";
import type {
  LinkOrCreateClientProfileInput,
  LinkOrCreateClientProfileResult,
} from "../types";

// Only fills fields the matched ClientProfile doesn't already have set --
// unlike booking's resolveGuestClientProfile, this is a one-time
// authenticated link (CLAUDE.md 26.1.2.4), not a repeat guest checkout,
// so it must never clobber another client's existing saved data.
function blankFieldsToFill(
  existing: ClientProfile,
  input: LinkOrCreateClientProfileInput
): Partial<Pick<ClientProfile, "phone" | "firstName" | "lastName" | "dateOfBirth">> {
  const fillable: Partial<
    Pick<ClientProfile, "phone" | "firstName" | "lastName" | "dateOfBirth">
  > = {};
  if (!existing.phone && input.phone) fillable.phone = input.phone;
  if (!existing.firstName && input.firstName) fillable.firstName = input.firstName;
  if (!existing.lastName && input.lastName) fillable.lastName = input.lastName;
  if (!existing.dateOfBirth && input.dateOfBirth) fillable.dateOfBirth = input.dateOfBirth;
  return fillable;
}

export async function linkOrCreateClientProfileForAccount(
  accountId: string,
  input: LinkOrCreateClientProfileInput
): Promise<LinkOrCreateClientProfileResult> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUniqueOrThrow({
      where: { id: accountId },
    });

    if (account.clientProfileId) {
      return {
        success: false,
        error: ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
      };
    }

    const matchedByHandle = await tx.clientProfile.findUnique({
      where: { instagramHandle: input.instagramHandle },
      include: { account: true },
    });

    const matched =
      matchedByHandle ??
      (await tx.clientProfile.findUnique({
        where: { email: account.email },
        include: { account: true },
      }));

    if (matched) {
      if (matched.account) {
        return {
          success: false,
          error: CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
        };
      }

      const fillableFields = blankFieldsToFill(matched, input);
      if (Object.keys(fillableFields).length > 0) {
        await tx.clientProfile.update({
          where: { id: matched.id },
          data: fillableFields,
        });
      }

      await tx.account.update({
        where: { id: accountId },
        data: { clientProfileId: matched.id },
      });

      return { success: true, clientProfileId: matched.id };
    }

    const created = await tx.clientProfile.create({
      data: {
        instagramHandle: input.instagramHandle,
        email: account.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: { clientProfileId: created.id },
    });

    return { success: true, clientProfileId: created.id };
  });
}
