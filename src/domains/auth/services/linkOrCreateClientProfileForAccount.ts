import { Prisma, type ClientProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
  CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
  SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type {
  AuditReasonCodeValue,
  LinkOrCreateClientProfileInput,
  LinkOrCreateClientProfileResult,
} from "../types";
import { recordAuditEvent } from "./recordAuditEvent";

// Private to this file: the public result can't distinguish "created" from
// "matched existing", so the transaction also carries the audit reasonCode.
interface LinkOutcome {
  result: LinkOrCreateClientProfileResult;
  reasonCode: Extract<
    AuditReasonCodeValue,
    | "ALREADY_HAS_CLIENT_PROFILE"
    | "CLIENT_PROFILE_ALREADY_LINKED"
    | "CLIENT_PROFILE_CREATED"
    | "CLIENT_PROFILE_MATCHED_EXISTING"
  >;
}

function isClientProfileUniqueConflict(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

// Only fills fields the matched ClientProfile doesn't already have set --
// this is a one-time authenticated link (CLAUDE.md 26.1.2.4), so it must
// never clobber another client's existing saved data.
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
  // Never rethrows (CLAUDE.md 27.2) -- useSetUpClientProfile has no
  // try/catch around the action, so an escaped throw leaves the form
  // stuck mid-submit. Unlike updateClientProfile, P2002 isn't mapped to a
  // specific message: the check-then-create race below can mean a self
  // double-submit or a genuine two-user collision, so it gets the same
  // generic, retryable error and is only distinguished in the log.
  try {
    const outcome = await prisma.$transaction(async (tx): Promise<LinkOutcome> => {
      const account = await tx.account.findUniqueOrThrow({
        where: { id: accountId },
      });

      if (account.clientProfileId) {
        return {
          result: {
            success: false,
            error: ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
          },
          reasonCode: "ALREADY_HAS_CLIENT_PROFILE",
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
            result: {
              success: false,
              error: CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
            },
            reasonCode: "CLIENT_PROFILE_ALREADY_LINKED",
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

        return {
          result: { success: true, clientProfileId: matched.id },
          reasonCode: "CLIENT_PROFILE_MATCHED_EXISTING",
        };
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

      return {
        result: { success: true, clientProfileId: created.id },
        reasonCode: "CLIENT_PROFILE_CREATED",
      };
    });

    // After the transaction resolves so a rollback/throw never records an
    // event for a link that didn't happen. recordAuditEvent never throws,
    // so it can't divert a decided result into the generic-error catch.
    await recordAuditEvent({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: outcome.result.success ? "SUCCESS" : "REJECTED",
      reasonCode: outcome.reasonCode,
      accountId,
    });

    return outcome.result;
  } catch (error) {
    // accountId only -- never the email or instagram handle (PII).
    if (isClientProfileUniqueConflict(error)) {
      console.error(
        `ClientProfile unique conflict while linking account ${accountId}:`,
        error.code
      );
    } else {
      console.error(
        `Unexpected failure linking ClientProfile for account ${accountId}:`,
        error
      );
    }
    return { success: false, error: SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE };
  }
}
