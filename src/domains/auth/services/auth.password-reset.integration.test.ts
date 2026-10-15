import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import type { AccountRole, AuditEventOutcome, AuditReasonCode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createIntegrationTracker, uniqueSuffix } from "@/testUtils/integrationDb";

import {
  INVALID_CREDENTIALS_ERROR_MESSAGE,
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  LOGIN_LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  MAX_LIVE_PASSWORD_RESET_TOKENS,
  PASSWORD_RESET_REQUEST_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_EXPIRY_MS,
} from "../constants";
import type { LoginResult } from "../types";
import { createSession } from "./createSession";
import { generatePasswordResetToken } from "./generatePasswordResetToken";
import { hashPassword } from "./hashPassword";
import { hashPasswordResetToken } from "./hashPasswordResetToken";
import { issuePasswordResetToken } from "./issuePasswordResetToken";
import { loginArtist } from "./loginArtist";
import { requestArtistPasswordReset } from "./requestArtistPasswordReset";
import { resetArtistPassword } from "./resetArtistPassword";
import { sendPasswordResetEmail } from "./sendPasswordResetEmail";
import { verifyPassword } from "./verifyPassword";

// External side effect only -- never hit Resend from the integration tier.
vi.mock("./sendPasswordResetEmail", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Real-database artist password-reset tests (71.1.2.5). The mocked unit
// tier stubs $transaction, so only Postgres can prove that the issue's
// FOR UPDATE lock serialises a burst, that the reset's guarded delete lets
// exactly one redeem win and rolls the losers' password writes back, and
// that a reset really clears the lock and every other session and link.
const tracker = createIntegrationTracker();
const sendPasswordResetEmailMock = vi.mocked(sendPasswordResetEmail);

const ORIGINAL_PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new artist password";
const ONE_MINUTE_MS = 60_000;
// The default pg pool size, so the calls genuinely race instead of
// queueing for a connection.
const BURST_WIDTH = 10;
const REQUESTED = { success: true };
const INVALID_LINK = { success: false, error: INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE };
const REJECTED_LOGIN = { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };

type SignedIn = Extract<LoginResult, { success: true }>;

interface ArtistAccount {
  id: string;
  email: string;
  artistId: string;
}

interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

interface StoredLink {
  id: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

interface StoredSession {
  id: string;
  activeRole: AccountRole;
}

interface ResetAudit {
  outcome: AuditEventOutcome;
  reasonCode: AuditReasonCode;
}

const CLEAN: LockoutState = { failedLoginAttempts: 0, lockedUntil: null };

// Hashed once in beforeAll: scrypt is deliberately slow.
let originalPasswordHash: string;

// The account is linked to a tracked artist, so wipe() removes it along with
// its links, sessions and audit rows.
async function createArtistAccount(state: LockoutState = CLEAN): Promise<ArtistAccount> {
  const artist = await tracker.createArtist();
  const account = await prisma.account.create({
    data: {
      email: artist.email,
      passwordHash: originalPasswordHash,
      role: "ARTIST",
      artistId: artist.id,
      ...state,
    },
  });
  return { id: account.id, email: account.email, artistId: artist.id };
}

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

// Issues a link through the real write path, skipping
// requestArtistPasswordReset's response floor and send.
async function issueLink(accountId: string): Promise<string> {
  const issue = await issuePasswordResetToken(accountId);
  if (!issue.issued) {
    throw new Error("expected a fresh link to be issued");
  }
  return issue.token;
}

// Inserts a link created at `createdAt` and expiring an hour later, for
// states issuePasswordResetToken won't produce on demand: several live
// links at once, or an expired one.
async function seedLink(accountId: string, createdAt: Date): Promise<{ id: string; token: string }> {
  const { token, tokenHash, expiresAt } = generatePasswordResetToken(createdAt);
  const link = await prisma.passwordResetToken.create({
    data: { accountId, tokenHash, expiresAt, createdAt },
    select: { id: true },
  });
  return { id: link.id, token };
}

// A minute clear of each boundary, so neither can flake.
function seedLiveLinkPastCooldown(accountId: string): Promise<{ id: string; token: string }> {
  return seedLink(accountId, ago(PASSWORD_RESET_REQUEST_COOLDOWN_MS + ONE_MINUTE_MS));
}

function seedExpiredLink(accountId: string): Promise<{ id: string; token: string }> {
  return seedLink(accountId, ago(PASSWORD_RESET_TOKEN_EXPIRY_MS + ONE_MINUTE_MS));
}

function linksFor(accountId: string): Promise<StoredLink[]> {
  return prisma.passwordResetToken.findMany({
    where: { accountId },
    select: { id: true, tokenHash: true, createdAt: true, expiresAt: true },
  });
}

async function linkIdsFor(accountId: string): Promise<string[]> {
  return (await linksFor(accountId)).map((link) => link.id).sort();
}

function sessionsFor(accountId: string): Promise<StoredSession[]> {
  return prisma.session.findMany({
    where: { accountId },
    select: { id: true, activeRole: true },
  });
}

function resetAuditsFor(accountId: string): Promise<ResetAudit[]> {
  return prisma.auditEvent.findMany({
    where: { accountId, eventType: "PASSWORD_RESET" },
    select: { outcome: true, reasonCode: true },
  });
}

async function readPasswordHash(accountId: string): Promise<string | null> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { passwordHash: true },
  });
  return account.passwordHash;
}

function readLockoutState(accountId: string): Promise<LockoutState> {
  return prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { failedLoginAttempts: true, lockedUntil: true },
  });
}

function expectSignedIn(result: LoginResult): SignedIn {
  if (!result.success) {
    throw new Error(`expected a signed-in result, got: ${result.error}`);
  }
  return result;
}

// allSettled, not Promise.all: a rejection would end the wait while the other
// calls are still writing. Neither service throws, so every call must be
// fulfilled.
async function burst<T>(run: (index: number) => Promise<T>): Promise<T[]> {
  const settled = await Promise.allSettled(
    Array.from({ length: BURST_WIDTH }, (_, index) => run(index))
  );
  expect(settled.map((result) => result.status)).toEqual(Array(BURST_WIDTH).fill("fulfilled"));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function requestBurst(email: string): Promise<{ success: boolean }[]> {
  return burst(() => requestArtistPasswordReset({ email }));
}

describe("artist password reset integration", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeAll(async () => {
    originalPasswordHash = await hashPassword(ORIGINAL_PASSWORD);
  });

  beforeEach(async () => {
    await tracker.wipe();
    sendPasswordResetEmailMock.mockClear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Every case here is a normal path, including a lost reset race. A log
    // would mean a service fell into its unexpected-failure branch, or a
    // send timed out.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("requestArtistPasswordReset: the issue row lock and limits", () => {
    it("a burst of requests issues exactly one link and sends it once", async () => {
      const account = await createArtistAccount();

      const results = await requestBurst(account.email);

      expect(results).toEqual(Array(BURST_WIDTH).fill(REQUESTED));
      expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
      const [sentTo, sentToken] = sendPasswordResetEmailMock.mock.calls[0];
      expect(sentTo).toBe(account.email);
      const links = await linksFor(account.id);
      expect(links).toHaveLength(1);
      expect(links[0].tokenHash).toBe(hashPasswordResetToken(sentToken));
      expect(links[0].expiresAt.getTime() - links[0].createdAt.getTime()).toBe(
        PASSWORD_RESET_TOKEN_EXPIRY_MS
      );
    });

    it("issues and sends nothing to a burst while the live-link cap is full, even past the cooldown", async () => {
      const account = await createArtistAccount();
      const seeded = await Promise.all(
        Array.from({ length: MAX_LIVE_PASSWORD_RESET_TOKENS }, () => seedLiveLinkPastCooldown(account.id))
      );

      const results = await requestBurst(account.email);

      expect(results).toEqual(Array(BURST_WIDTH).fill(REQUESTED));
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
      expect(await linkIdsFor(account.id)).toEqual(seeded.map((link) => link.id).sort());
    });

    it("deletes an expired link before counting, so a burst issues exactly one link into the freed place", async () => {
      const account = await createArtistAccount();
      const live = await Promise.all(
        Array.from({ length: MAX_LIVE_PASSWORD_RESET_TOKENS - 1 }, () =>
          seedLiveLinkPastCooldown(account.id)
        )
      );
      const expired = await seedExpiredLink(account.id);
      const liveIds = live.map((link) => link.id);

      const results = await requestBurst(account.email);

      expect(results).toEqual(Array(BURST_WIDTH).fill(REQUESTED));
      expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
      const [, sentToken] = sendPasswordResetEmailMock.mock.calls[0];
      const links = await linksFor(account.id);
      expect(links.map((link) => link.id)).not.toContain(expired.id);
      // The seeded live links survive, plus exactly the one that was sent.
      expect(links.filter((link) => liveIds.includes(link.id))).toHaveLength(liveIds.length);
      expect(links.filter((link) => !liveIds.includes(link.id)).map((link) => link.tokenHash)).toEqual([
        hashPasswordResetToken(sentToken),
      ]);
    });

    it("neither issues nor sends a link for a CLIENT account or an unknown email", async () => {
      const client = await tracker.createClientProfile();
      await prisma.account.create({
        data: { email: client.email, role: "CLIENT", clientProfileId: client.id },
      });
      const unknownEmail = `it_unknown_${uniqueSuffix()}@example.com`;

      // In parallel, so the response floor is paid once.
      const results = await Promise.all(
        [client.email, unknownEmail].map((email) => requestArtistPasswordReset({ email }))
      );

      expect(results).toEqual([REQUESTED, REQUESTED]);
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
      expect(
        await prisma.passwordResetToken.count({
          where: { account: { email: { in: [client.email, unknownEmail] } } },
        })
      ).toBe(0);
    });
  });

  describe("resetArtistPassword: redeeming a link", () => {
    it("lets exactly one of a burst of resets with one link win: one session, one password change", async () => {
      const account = await createArtistAccount();
      const token = await issueLink(account.id);
      const passwordFor = (index: number): string => `${NEW_PASSWORD} ${index}`;

      const results = await burst((index) => resetArtistPassword({ token, newPassword: passwordFor(index) }));

      const winners = results.flatMap((result, index) => (result.success ? [{ result, index }] : []));
      expect(winners).toHaveLength(1);
      expect(results.filter((result) => !result.success)).toEqual(Array(BURST_WIDTH - 1).fill(INVALID_LINK));
      const [{ result: won, index: winnerIndex }] = winners;
      expect(won.artistId).toBe(account.artistId);

      expect(await sessionsFor(account.id)).toEqual([{ id: won.sessionId, activeRole: "ARTIST" }]);
      expect(await linksFor(account.id)).toEqual([]);
      expect(await resetAuditsFor(account.id)).toEqual([
        { outcome: "SUCCESS", reasonCode: "PASSWORD_RESET_WITH_EMAIL_LINK" },
      ]);
      // A loser's password write that had committed would have replaced the
      // winner's, so the stored hash proves every loser rolled back.
      expect(await verifyPassword(passwordFor(winnerIndex), await readPasswordHash(account.id))).toBe(true);
    });

    it("clears a lockout, after which the old password is rejected and the new one signs in", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS),
      });
      const token = await issueLink(account.id);

      const result = expectSignedIn(await resetArtistPassword({ token, newPassword: NEW_PASSWORD }));

      expect(result.artistId).toBe(account.artistId);
      expect(await readLockoutState(account.id)).toEqual(CLEAN);
      expect(await loginArtist({ email: account.email, password: ORIGINAL_PASSWORD })).toEqual(
        REJECTED_LOGIN
      );
      const login = expectSignedIn(await loginArtist({ email: account.email, password: NEW_PASSWORD }));
      expect(login.artistId).toBe(account.artistId);
    });

    it("removes the account's earlier sessions and other links, and leaves another account's alone", async () => {
      const account = await createArtistAccount();
      const bystander = await createArtistAccount();
      await createSession(account.id, "ARTIST");
      await createSession(account.id, "ARTIST");
      const token = await issueLink(account.id);
      await seedLiveLinkPastCooldown(account.id);
      await seedLiveLinkPastCooldown(account.id);
      const bystanderSession = await createSession(bystander.id, "ARTIST");
      const bystanderToken = await issueLink(bystander.id);

      const result = expectSignedIn(await resetArtistPassword({ token, newPassword: NEW_PASSWORD }));

      expect(await sessionsFor(account.id)).toEqual([{ id: result.sessionId, activeRole: "ARTIST" }]);
      expect(await linksFor(account.id)).toEqual([]);
      // Every delete is scoped to the reset account.
      expect(await sessionsFor(bystander.id)).toEqual([{ id: bystanderSession.id, activeRole: "ARTIST" }]);
      expect((await linksFor(bystander.id)).map((link) => link.tokenHash)).toEqual([
        hashPasswordResetToken(bystanderToken),
      ]);
    });

    it("rejects an expired link and leaves the password unchanged", async () => {
      const account = await createArtistAccount();
      const { token } = await seedExpiredLink(account.id);

      expect(await resetArtistPassword({ token, newPassword: NEW_PASSWORD })).toEqual(INVALID_LINK);

      expect(await readPasswordHash(account.id)).toBe(originalPasswordHash);
      expect(await sessionsFor(account.id)).toEqual([]);
      expect(await resetAuditsFor(account.id)).toEqual([]);
    });
  });
});
