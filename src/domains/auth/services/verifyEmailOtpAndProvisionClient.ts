import { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  ARTIST_ACCOUNT_SET_UP_CLIENT_PROFILE_MESSAGE,
  ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE,
  BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type {
  AuditReasonCodeValue,
  ClientAuthResult,
  RecordAuditEventInput,
  VerifyEmailOtpAndProvisionClientInput,
} from "../types";
import { checkEmailOtpCode } from "./checkEmailOtpCode";
import { createSession } from "./createSession";
import { recordAuditEvent } from "./recordAuditEvent";

const INVALID_RESULT: ClientAuthResult = {
  success: false,
  error: INVALID_EMAIL_OTP_ERROR_MESSAGE,
};

// Private to this file: what a proven email resolves to before anything
// is written. Each provision kind has its own SUCCESS audit reasonCode.
type Provision =
  | { kind: "EXISTING"; accountId: string; clientProfileId: string }
  | { kind: "LINK"; clientProfileId: string }
  | { kind: "CREATE" };

interface Rejection {
  kind: "REJECTED";
  error: string;
  reasonCode: Extract<
    AuditReasonCodeValue,
    | "ROLE_MISMATCH"
    | "NOT_LINKED_TO_CLIENT"
    | "CLIENT_PROFILE_ALREADY_LINKED"
    | "INSTAGRAM_HANDLE_TAKEN"
  >;
  accountId?: string;
}

const SUCCESS_REASON_CODES: Record<
  Provision["kind"],
  Extract<
    AuditReasonCodeValue,
    | "SIGNED_IN_WITH_EMAIL_OTP"
    | "CLIENT_ACCOUNT_LINKED_TO_EXISTING_PROFILE"
    | "CLIENT_ACCOUNT_AND_PROFILE_CREATED"
  >
> = {
  EXISTING: "SIGNED_IN_WITH_EMAIL_OTP",
  LINK: "CLIENT_ACCOUNT_LINKED_TO_EXISTING_PROFILE",
  CREATE: "CLIENT_ACCOUNT_AND_PROFILE_CREATED",
};

// accountId once there's an account of our own to attach to, otherwise
// attemptedEmail (AuditEvent's convention).
function auditIdentity(
  accountId: string | undefined,
  email: string
): Pick<RecordAuditEventInput, "accountId" | "attemptedEmail"> {
  return accountId !== undefined ? { accountId } : { attemptedEmail: email };
}

// Reads only, through one REPEATABLE READ snapshot (54.9.2.1): a
// concurrent verify's commit is seen entirely or not at all, never split
// across the reads -- a split read once turned a lost double-verify into a
// false "email unavailable". A unique index backs the gap between this
// snapshot and the writes, so a stale snapshot ends in a P2002, not a
// duplicate. The draft's handle is consulted only when nothing matches
// the email: a verified email never claims another client's profile by
// handle, which is why linkOrCreateClientProfileForAccount isn't reused.
async function resolveClient(
  reader: Prisma.TransactionClient,
  email: string,
  instagramHandle: string
): Promise<Provision | Rejection> {
  const account = await reader.account.findUnique({
    where: { email },
    select: { id: true, role: true, clientProfileId: true },
  });

  if (account) {
    if (account.role !== "CLIENT") {
      return {
        kind: "REJECTED",
        error:
          account.clientProfileId !== null
            ? ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE
            : ARTIST_ACCOUNT_SET_UP_CLIENT_PROFILE_MESSAGE,
        reasonCode: "ROLE_MISMATCH",
        accountId: account.id,
      };
    }
    if (account.clientProfileId === null) {
      return {
        kind: "REJECTED",
        error: BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
        reasonCode: "NOT_LINKED_TO_CLIENT",
        accountId: account.id,
      };
    }
    return { kind: "EXISTING", accountId: account.id, clientProfileId: account.clientProfileId };
  }

  const profileByEmail = await reader.clientProfile.findUnique({
    where: { email },
    select: { id: true, account: { select: { id: true } } },
  });

  if (profileByEmail) {
    if (profileByEmail.account !== null) {
      return {
        kind: "REJECTED",
        error: BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
        reasonCode: "CLIENT_PROFILE_ALREADY_LINKED",
      };
    }
    return { kind: "LINK", clientProfileId: profileByEmail.id };
  }

  const profileByHandle = await reader.clientProfile.findUnique({
    where: { instagramHandle },
    select: { id: true },
  });

  if (profileByHandle) {
    return {
      kind: "REJECTED",
      error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
      reasonCode: "INSTAGRAM_HANDLE_TAKEN",
    };
  }
  return { kind: "CREATE" };
}

// Runs inside the caller's transaction, after the consume. A new Account
// has no password and is verified -- the code just proved the inbox. A new
// ClientProfile gets only the handle and email; createBookingRequest
// (54.5.2.3) fills the blank name, DOB and phone on every path.
async function provisionClient(
  tx: Prisma.TransactionClient,
  email: string,
  instagramHandle: string,
  provision: Provision
): Promise<{ accountId: string; clientProfileId: string }> {
  if (provision.kind === "EXISTING") {
    return { accountId: provision.accountId, clientProfileId: provision.clientProfileId };
  }

  const clientProfileId =
    provision.kind === "LINK"
      ? provision.clientProfileId
      : (
          await tx.clientProfile.create({
            data: { instagramHandle, email },
            select: { id: true },
          })
        ).id;

  const account = await tx.account.create({
    data: { email, role: "CLIENT", emailVerifiedAt: new Date(), clientProfileId },
    select: { id: true },
  });

  return { accountId: account.id, clientProfileId };
}

// Domain Service (54.5.2.2): redeems a BOOKING_SUBMISSION code, then
// resolves or provisions the client and issues a CLIENT session -- the
// verify half of 54.5.2.1. Called by booking's
// submitBookingRequestWithEmailOtp (54.5.2.5), which owns the booking
// write that follows.
//
// Before the code is proven, every rejection is the same generic error.
// After it, the outcome is specific (artist account, unavailable email,
// taken handle), since only the inbox owner can see it -- and the
// 5-attempt cap bounds handle probing per code. An ARTIST-home account
// (incl. dual-role) never gets a session: email access must not bypass
// the artist password.
//
// The code is checked outside the transaction so its reserved attempt
// survives a rollback. A rejection returns before the transaction opens,
// leaving the code unconsumed. The consume, the provisioning writes and
// the session then commit together: a P2002 (same new handle or email
// racing) rolls back and leaves the code redeemable, and the consume's
// guard (challengeId + codeHash) makes a concurrent double-verify yield
// exactly one session. The resolve reads share one snapshot, so each
// loser resolves to the state before the winner or after it, and its
// consume then finds the code gone: every loser gets the generic invalid
// result.
//
// emailVerifiedAt is set only on a new, passwordless Account. An existing
// one is untouched: until 54.8 nulls client passwords, setting it would
// let a squatter's password log into an unverified account (27.3.2.8).
export async function verifyEmailOtpAndProvisionClient(
  input: VerifyEmailOtpAndProvisionClientInput
): Promise<ClientAuthResult> {
  const email = normalizeEmail(input.email);

  try {
    const check = await checkEmailOtpCode({
      email,
      purpose: "BOOKING_SUBMISSION",
      code: input.code,
    });
    if (!check.valid) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
        outcome: "REJECTED",
        reasonCode: "INVALID_EMAIL_OTP",
        attemptedEmail: email,
      });
      return INVALID_RESULT;
    }

    // Read-only, so REPEATABLE READ can't raise a serialization failure;
    // it releases its connection before the consume transaction opens.
    const resolution = await prisma.$transaction(
      (reader) => resolveClient(reader, email, input.instagramHandle),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
    if (resolution.kind === "REJECTED") {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
        outcome: "REJECTED",
        reasonCode: resolution.reasonCode,
        ...auditIdentity(resolution.accountId, email),
      });
      return { success: false, error: resolution.error };
    }

    const provisioned = await prisma.$transaction(async (tx) => {
      const { count: consumed } = await tx.emailOtpChallenge.updateMany({
        where: { id: check.challengeId, codeHash: check.codeHash },
        data: { codeHash: null, consumedAt: new Date() },
      });
      if (consumed === 0) {
        // A concurrent verify with the same code, or a reissue, got there
        // first.
        return null;
      }
      const client = await provisionClient(tx, email, input.instagramHandle, resolution);
      const session = await createSession(client.accountId, "CLIENT", tx);
      return { ...client, session };
    });

    // After the transaction resolves, so a rollback never records a
    // provisioning that didn't happen.
    if (!provisioned) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
        outcome: "REJECTED",
        reasonCode: "INVALID_EMAIL_OTP",
        ...auditIdentity(
          resolution.kind === "EXISTING" ? resolution.accountId : undefined,
          email
        ),
      });
      return INVALID_RESULT;
    }

    await recordAuditEvent({
      eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
      outcome: "SUCCESS",
      reasonCode: SUCCESS_REASON_CODES[resolution.kind],
      accountId: provisioned.accountId,
    });

    return {
      success: true,
      sessionId: provisioned.session.id,
      expiresAt: provisioned.session.expiresAt,
      clientProfileId: provisioned.clientProfileId,
    };
  } catch (error) {
    // A P2002 is ambiguous (self double-submit vs. a genuine two-user
    // race), so it gets the same retryable message; a retry resolves
    // through the current state, e.g. a lost handle race becomes
    // INSTAGRAM_HANDLE_TAKEN. Fixed allowlist plus the typed Prisma code
    // only -- never the email, handle, code or raw driver message
    // (architecture.md Sec8.B).
    const errorCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    console.error({
      operation: "verifyEmailOtpAndProvisionClient",
      reason: errorCode === "P2002" ? "unique_conflict" : "unexpected_failure",
      errorCode,
    });
    return { success: false, error: VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE };
  }
}
