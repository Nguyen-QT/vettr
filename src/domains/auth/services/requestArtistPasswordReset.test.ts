import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import {
  ARTIST_PASSWORD_RESET_REQUEST_RESPONSE_FLOOR_MS,
  EMAIL_OTP_SEND_TIMEOUT_MS,
  REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { RequestArtistPasswordResetResult } from "../types";
import { issuePasswordResetToken } from "./issuePasswordResetToken";
import { requestArtistPasswordReset } from "./requestArtistPasswordReset";
import { sendPasswordResetEmail } from "./sendPasswordResetEmail";

vi.mock("./issuePasswordResetToken", () => ({ issuePasswordResetToken: vi.fn() }));
vi.mock("./sendPasswordResetEmail", () => ({ sendPasswordResetEmail: vi.fn() }));

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "artist@example.com";
const ACCOUNT_ID = "account_1";
const TOKEN = "q7Lm0x-Rt2_Vb9KcWn4YpZs8eHd3JfAg6uTiOy1BvNk";
const FLOOR = ARTIST_PASSWORD_RESET_REQUEST_RESPONSE_FLOOR_MS;
const SUCCESS = { success: true };
const DB_ERROR = { success: false, error: REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE };

function accountRow(role: "ARTIST" | "CLIENT", artistId: string | null) {
  return { id: ACCOUNT_ID, role, artistId } as never;
}

// Tracks settlement without awaiting, so a test can prove the response is
// still held back by the floor at a given fake-clock time.
function track(promise: Promise<RequestArtistPasswordResetResult>) {
  const state: { settled: boolean; result?: RequestArtistPasswordResetResult } = {
    settled: false,
  };
  void promise.then((result) => {
    state.settled = true;
    state.result = result;
  });
  return state;
}

async function runPastFloor(): Promise<RequestArtistPasswordResetResult> {
  const pending = requestArtistPasswordReset({ email: EMAIL });
  await vi.advanceTimersByTimeAsync(FLOOR);
  return pending;
}

function givenEligibleArtist(): void {
  prismaMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", "artist_1"));
  vi.mocked(issuePasswordResetToken).mockResolvedValue({ issued: true, token: TOKEN });
}

function givenRefusedIssue(): void {
  prismaMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", "artist_1"));
  vi.mocked(issuePasswordResetToken).mockResolvedValue({ issued: false });
}

function loggedText(spy: MockInstance<typeof console.error>): string {
  return JSON.stringify(spy.mock.calls);
}

describe("requestArtistPasswordReset", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(issuePasswordResetToken).mockReset();
    vi.mocked(sendPasswordResetEmail).mockReset();
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("issues a link for an artist looked up by the normalised email and emails that exact token", async () => {
    givenEligibleArtist();

    const pending = requestArtistPasswordReset({ email: "  Artist@Example.COM " });
    await vi.advanceTimersByTimeAsync(0);
    // Only the floor's sleep is pending -- the send-timeout timer was
    // cleared the moment the send won the race.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(FLOOR);

    expect(await pending).toEqual(SUCCESS);
    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
      select: { id: true, role: true, artistId: true },
    });
    expect(issuePasswordResetToken).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(EMAIL, TOKEN);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["no account", null],
    ["a CLIENT account", accountRow("CLIENT", null)],
    ["an ARTIST account with no linked artist", accountRow("ARTIST", null)],
  ])("returns the same success without issuing or sending for %s", async (_label, account) => {
    prismaMock.account.findUnique.mockResolvedValue(account);

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(issuePasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns the same success without sending when the issue is refused (cooldown, cap, deleted account)", async () => {
    givenRefusedIssue();

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(issuePasswordResetToken).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("still succeeds when the send fails, logging nothing of its own", async () => {
    givenEligibleArtist();
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: false });

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("abandons a send that misses the timeout, logs it, and still answers at the floor", async () => {
    givenEligibleArtist();
    vi.mocked(sendPasswordResetEmail).mockReturnValue(new Promise(() => {}));

    const state = track(requestArtistPasswordReset({ email: EMAIL }));

    await vi.advanceTimersByTimeAsync(EMAIL_OTP_SEND_TIMEOUT_MS);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestArtistPasswordReset",
      reason: "send_timed_out",
    });
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(FLOOR - EMAIL_OTP_SEND_TIMEOUT_MS);
    expect(state.settled).toBe(true);
    expect(state.result).toEqual(SUCCESS);
    expect(vi.getTimerCount()).toBe(0);
    expect(loggedText(consoleErrorSpy)).not.toContain(TOKEN);
    expect(loggedText(consoleErrorSpy)).not.toContain(EMAIL);
  });

  it.each([
    ["an eligible send", givenEligibleArtist, SUCCESS],
    ["an ineligible address", () => prismaMock.account.findUnique.mockResolvedValue(null), SUCCESS],
    ["a refused issue", givenRefusedIssue, SUCCESS],
    [
      "a DB failure",
      () => prismaMock.account.findUnique.mockRejectedValue(new Error("connection lost")),
      DB_ERROR,
    ],
  ])("holds the response floor for %s", async (_label, arrange, expected) => {
    arrange();

    const state = track(requestArtistPasswordReset({ email: EMAIL }));

    await vi.advanceTimersByTimeAsync(FLOOR - 1);
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    expect(state.result).toEqual(expected);
  });

  it("adds no padding once the work itself has already exceeded the floor", async () => {
    const slowLookupMs = FLOOR + 500;
    prismaMock.account.findUnique.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), slowLookupMs)) as never
    );

    const state = track(requestArtistPasswordReset({ email: EMAIL }));

    await vi.advanceTimersByTimeAsync(slowLookupMs);
    expect(state.settled).toBe(true);
    expect(state.result).toEqual(SUCCESS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a generic error and logs only a fixed reason when the account lookup throws", async () => {
    prismaMock.account.findUnique.mockRejectedValue(new Error(`connection lost for ${EMAIL}`));

    const result = await runPastFloor();

    expect(result).toEqual(DB_ERROR);
    expect(issuePasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestArtistPasswordReset",
      reason: "unexpected_failure",
      errorCode: undefined,
    });
    expect(loggedText(consoleErrorSpy)).not.toContain(EMAIL);
  });

  it("returns the same generic error without sending when issuing the link throws", async () => {
    prismaMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", "artist_1"));
    vi.mocked(issuePasswordResetToken).mockRejectedValue(new Error(`timeout for ${EMAIL}`));

    const result = await runPastFloor();

    expect(result).toEqual(DB_ERROR);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestArtistPasswordReset",
      reason: "unexpected_failure",
      errorCode: undefined,
    });
    expect(loggedText(consoleErrorSpy)).not.toContain(EMAIL);
  });

  it("logs the typed Prisma code, but never its message, for a known driver error", async () => {
    prismaMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", "artist_1"));
    vi.mocked(issuePasswordResetToken).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(`Write conflict for ${EMAIL}`, {
        code: "P2034",
        clientVersion: "test",
      })
    );

    const result = await runPastFloor();

    expect(result).toEqual(DB_ERROR);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestArtistPasswordReset",
      reason: "unexpected_failure",
      errorCode: "P2034",
    });
    expect(loggedText(consoleErrorSpy)).not.toContain(EMAIL);
    expect(loggedText(consoleErrorSpy)).not.toContain(TOKEN);
  });
});
