import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { prisma } from "@/lib/prisma";
import { createIntegrationTracker, uniqueSuffix } from "@/testUtils/integrationDb";

import {
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { ClientAuthResult } from "../types";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { issueEmailOtp } from "./issueEmailOtp";
import { verifyEmailOtpAndProvisionClient } from "./verifyEmailOtpAndProvisionClient";

// Real-database booking-code provisioning tests (54.5.2.6): the mocked
// unit tier stubs $transaction, so only Postgres can prove the consume
// guard decides a double verify, a unique-index P2002 rolls the consume
// back, and a lost handle leaves the loser's code redeemable. Parallel
// width stays within the default pg pool size (10) so the calls genuinely
// race instead of queueing for a connection.
const tracker = createIntegrationTracker();

const INVALID = { success: false, error: INVALID_EMAIL_OTP_ERROR_MESSAGE };
// Within the cap, so every call can reserve an attempt and the race is
// decided at the consume guard.
const PARALLEL_VERIFIES = MAX_EMAIL_VERIFICATION_ATTEMPTS;
// Which of these a same-handle loser sees depends on the interleaving: a
// P2002 inside the transaction, or the winner's committed profile at
// resolve time.
const HANDLE_RACE_LOSER_ERRORS = [
  VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
];
const LOCK_WAIT_POLL_MS = 25;
const LOCK_WAIT_DEADLINE_MS = 2_000;

type VerifiedClient = Extract<ClientAuthResult, { success: true }>;

interface Racer {
  email: string;
  code: string;
}

interface EmailState {
  account: { id: string } | null;
  profile: { id: string } | null;
  challenge: { codeHash: string | null; consumedAt: Date | null; attempts: number };
}

const usedEmails = new Set<string>();

function trackEmail(email: string): string {
  tracker.trackEmail(email);
  usedEmails.add(email);
  return email;
}

function newEmail(): string {
  return trackEmail(`it_otp_${uniqueSuffix()}@example.com`);
}

function newHandle(): string {
  return `it_otp_${uniqueSuffix()}`;
}

// The service creates ClientProfiles (and their Accounts) that only the
// email identifies. Tracking them after every test lets the next wipe()
// remove them and everything hanging off them, even after a failed
// assertion.
async function trackProvisionedProfiles(): Promise<void> {
  const profiles = await prisma.clientProfile.findMany({
    where: { email: { in: [...usedEmails] } },
    select: { id: true },
  });
  for (const { id } of profiles) {
    tracker.trackClientProfile(id);
  }
  usedEmails.clear();
}

// Seeds a code through the real write path, skipping the send.
async function issueBookingCode(email: string): Promise<string> {
  const otp = await issueEmailOtp({ email, purpose: "BOOKING_SUBMISSION" });
  if (!otp.issued) {
    throw new Error("expected a fresh code to be issued");
  }
  return otp.code;
}

async function newRacer(): Promise<Racer> {
  const email = newEmail();
  return { email, code: await issueBookingCode(email) };
}

function inParallel<T>(count: number, run: () => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, run));
}

function isVerified(result: ClientAuthResult): result is VerifiedClient {
  return result.success;
}

function errorsOf(results: ClientAuthResult[]): string[] {
  return results.flatMap((result) => (result.success ? [] : [result.error]));
}

async function stateFor(email: string): Promise<EmailState> {
  const [account, profile, challenge] = await Promise.all([
    prisma.account.findUnique({ where: { email }, select: { id: true } }),
    prisma.clientProfile.findUnique({ where: { email }, select: { id: true } }),
    prisma.emailOtpChallenge.findUniqueOrThrow({
      where: { email },
      select: { codeHash: true, consumedAt: true, attempts: true },
    }),
  ]);
  return { account, profile, challenge };
}

// Nothing provisioned and the code still redeemable, with only the
// reserved attempts spent.
function unprovisionedWithLiveCode(code: string, attempts: number): EmailState {
  return {
    account: null,
    profile: null,
    challenge: { codeHash: hashEmailVerificationCode(code), consumedAt: null, attempts },
  };
}

// Polls on its own pool connection until some backend is waiting on a
// lock the given backend holds. Keys on the lock graph, not SQL text:
// pg_stat_activity shows $n placeholders, never bound values.
async function waitUntilBlockedBy(blockerPid: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_DEADLINE_MS;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked
      FROM pg_stat_activity
      WHERE ${blockerPid}::int = ANY(pg_blocking_pids(pid))`;
    if (blocked > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
  }
  throw new Error("the verify never queued behind the rival's uncommitted handle");
}

describe("booking email-code provisioning integration", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(async () => {
    await tracker.wipe();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
    await trackProvisionedProfiles();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("concurrent first-time provisioning for one email", () => {
    it.each([
      { path: "CREATE", reasonCode: "CLIENT_ACCOUNT_AND_PROFILE_CREATED" },
      { path: "LINK", reasonCode: "CLIENT_ACCOUNT_LINKED_TO_EXISTING_PROFILE" },
    ] as const)(
      "$path: one verify wins at the consume; the losers get the generic invalid result",
      async ({ path, reasonCode }) => {
        const existing = path === "LINK" ? await tracker.createClientProfile() : null;
        const email = existing ? trackEmail(existing.email) : newEmail();
        const instagramHandle = newHandle();
        const code = await issueBookingCode(email);

        const results = await inParallel(PARALLEL_VERIFIES, () =>
          verifyEmailOtpAndProvisionClient({ email, code, instagramHandle })
        );

        expect(results.filter((r) => !r.success)).toEqual(
          Array(PARALLEL_VERIFIES - 1).fill(INVALID)
        );
        const winners = results.filter(isVerified);
        expect(winners).toHaveLength(1);
        const [winner] = winners;
        // Handled losers: no unique-conflict or unexpected-failure path.
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        const account = await prisma.account.findUniqueOrThrow({ where: { email } });
        expect(account).toMatchObject({
          role: "CLIENT",
          passwordHash: null,
          clientProfileId: winner.clientProfileId,
        });
        expect(account.emailVerifiedAt).not.toBeNull();

        // LINK keeps the existing profile and its handle; CREATE makes one
        // with the draft's handle.
        const profile = await prisma.clientProfile.findUniqueOrThrow({ where: { email } });
        expect(profile).toMatchObject({
          id: existing?.id ?? winner.clientProfileId,
          instagramHandle: existing?.instagramHandle ?? instagramHandle,
        });

        const sessions = await prisma.session.findMany({ where: { accountId: account.id } });
        expect(sessions).toEqual([
          expect.objectContaining({ id: winner.sessionId, activeRole: "CLIENT" }),
        ]);

        const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
        expect(challenge.codeHash).toBeNull();
        expect(challenge.consumedAt).not.toBeNull();

        const audits = await prisma.auditEvent.findMany({
          where: {
            eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
            OR: [{ accountId: account.id }, { attemptedEmail: email }],
          },
          select: { outcome: true, reasonCode: true, accountId: true, attemptedEmail: true },
        });
        expect(audits.filter((a) => a.outcome === "SUCCESS")).toEqual([
          { outcome: "SUCCESS", reasonCode, accountId: account.id, attemptedEmail: null },
        ]);
        // No account existed when the losers resolved, so each rejection is
        // keyed by the attempted email.
        expect(audits.filter((a) => a.outcome === "REJECTED")).toEqual(
          Array(PARALLEL_VERIFIES - 1).fill({
            outcome: "REJECTED",
            reasonCode: "INVALID_EMAIL_OTP",
            accountId: null,
            attemptedEmail: email,
          })
        );
      }
    );
  });

  describe("same handle, different emails", () => {
    it("exactly one email gets the handle; every loser's code stays redeemable", async () => {
      const instagramHandle = newHandle();
      const racers: Racer[] = [];
      for (let i = 0; i < PARALLEL_VERIFIES; i++) {
        racers.push(await newRacer());
      }

      const results = await Promise.all(
        racers.map(({ email, code }) =>
          verifyEmailOtpAndProvisionClient({ email, code, instagramHandle })
        )
      );

      const winners = results.filter(isVerified);
      expect(winners).toHaveLength(1);
      const winnerEmail = racers[results.findIndex((r) => r.success)].email;
      const loserErrors = errorsOf(results);
      expect(loserErrors).toHaveLength(PARALLEL_VERIFIES - 1);
      expect(HANDLE_RACE_LOSER_ERRORS).toEqual(expect.arrayContaining(loserErrors));

      const profile = await prisma.clientProfile.findUniqueOrThrow({
        where: { instagramHandle },
      });
      expect(profile).toMatchObject({ id: winners[0].clientProfileId, email: winnerEmail });

      const losers = racers.filter(({ email }) => email !== winnerEmail);
      // A rolled-back consume and a pre-transaction rejection look the
      // same: one reserved attempt, code intact.
      expect(await Promise.all(losers.map(({ email }) => stateFor(email)))).toEqual(
        losers.map(({ code }) => unprovisionedWithLiveCode(code, 1))
      );

      // Retrying the same code now resolves through the committed profile.
      const retries = await Promise.all(
        losers.map(({ email, code }) =>
          verifyEmailOtpAndProvisionClient({ email, code, instagramHandle })
        )
      );
      expect(retries).toEqual(
        Array(losers.length).fill({ success: false, error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE })
      );
      expect(await Promise.all(losers.map(({ email }) => stateFor(email)))).toEqual(
        losers.map(({ code }) => unprovisionedWithLiveCode(code, 2))
      );
    });
  });

  describe("a handle conflict leaves the code unconsumed", () => {
    it("a handle already taken is rejected before the transaction, and the code still redeems", async () => {
      const rival = await tracker.createClientProfile();
      const { email, code } = await newRacer();

      expect(
        await verifyEmailOtpAndProvisionClient({
          email,
          code,
          instagramHandle: rival.instagramHandle,
        })
      ).toEqual({ success: false, error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE });
      expect(await stateFor(email)).toEqual(unprovisionedWithLiveCode(code, 1));

      const retry = await verifyEmailOtpAndProvisionClient({
        email,
        code,
        instagramHandle: newHandle(),
      });
      expect(retry).toMatchObject({ success: true });
    });

    it("a handle lost to a concurrent insert rolls the consume back, and the code still redeems", async () => {
      const { email, code } = await newRacer();
      const instagramHandle = newHandle();

      // The rival holds the handle uncommitted: the verify can't see it at
      // resolve time, so it consumes the code inside its transaction and
      // then queues on the unique index. Committing the rival turns that
      // wait into a P2002.
      const { verification } = await prisma.$transaction(async (tx) => {
        await tx.clientProfile.create({
          data: { instagramHandle, email: newEmail() },
          select: { id: true },
        });
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        // Not awaited here: awaiting it inside the rival's transaction
        // would deadlock. The service never rejects.
        const pending = verifyEmailOtpAndProvisionClient({ email, code, instagramHandle });
        await waitUntilBlockedBy(pid);
        return { verification: pending };
      });

      expect(await verification).toEqual({
        success: false,
        error: VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
      });
      // Fixed allowlist plus the Prisma code -- no email, handle or code.
      expect(consoleErrorSpy.mock.calls).toEqual([
        [
          {
            operation: "verifyEmailOtpAndProvisionClient",
            reason: "unique_conflict",
            errorCode: "P2002",
          },
        ],
      ]);
      // The reserved attempt survives the rollback; the consume doesn't.
      expect(await stateFor(email)).toEqual(unprovisionedWithLiveCode(code, 1));

      const retry = await verifyEmailOtpAndProvisionClient({
        email,
        code,
        instagramHandle: newHandle(),
      });
      expect(retry).toMatchObject({ success: true });
    });
  });
});
