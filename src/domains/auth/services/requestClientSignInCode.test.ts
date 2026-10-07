import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  CLIENT_SIGN_IN_CODE_RESPONSE_FLOOR_MS,
  EMAIL_OTP_SEND_TIMEOUT_MS,
  REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { RequestClientSignInCodeResult } from "../types";
import { issueEmailOtp } from "./issueEmailOtp";
import { requestClientSignInCode } from "./requestClientSignInCode";
import { sendVerificationEmail } from "./sendVerificationEmail";

vi.mock("./issueEmailOtp", () => ({ issueEmailOtp: vi.fn() }));
vi.mock("./sendVerificationEmail", () => ({ sendVerificationEmail: vi.fn() }));

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "client@example.com";
const CODE = "042517";
const FLOOR = CLIENT_SIGN_IN_CODE_RESPONSE_FLOOR_MS;
const SUCCESS = { success: true };
const DB_ERROR = { success: false, error: REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE };

function accountRow(role: "ARTIST" | "CLIENT", clientProfileId: string | null) {
  return { role, clientProfileId } as never;
}

// Tracks settlement without awaiting, so a test can prove the response is
// still held back by the floor at a given fake-clock time.
function track(promise: Promise<RequestClientSignInCodeResult>) {
  const state: { settled: boolean; result?: RequestClientSignInCodeResult } = { settled: false };
  void promise.then((result) => {
    state.settled = true;
    state.result = result;
  });
  return state;
}

async function runPastFloor(): Promise<RequestClientSignInCodeResult> {
  const pending = requestClientSignInCode({ email: EMAIL });
  await vi.advanceTimersByTimeAsync(FLOOR);
  return pending;
}

function givenEligibleAccount(): void {
  prismaMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", "client_profile_1"));
  vi.mocked(issueEmailOtp).mockResolvedValue({ issued: true, code: CODE });
}

describe("requestClientSignInCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(issueEmailOtp).mockReset();
    vi.mocked(sendVerificationEmail).mockReset();
    vi.mocked(sendVerificationEmail).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("issues a CLIENT_SIGN_IN code for an eligible account and emails that exact code", async () => {
    givenEligibleAccount();

    const pending = requestClientSignInCode({ email: "  Client@Example.COM " });
    await vi.advanceTimersByTimeAsync(0);
    // Only the floor's sleep is pending -- the send-timeout timer was
    // cleared the moment the send won the race.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(FLOOR);

    expect(await pending).toEqual(SUCCESS);
    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
      select: { role: true, clientProfileId: true },
    });
    expect(issueEmailOtp).toHaveBeenCalledWith({ email: EMAIL, purpose: "CLIENT_SIGN_IN" });
    expect(sendVerificationEmail).toHaveBeenCalledWith(EMAIL, CODE);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["no account", null],
    ["a dual-role ARTIST-home account", accountRow("ARTIST", "client_profile_1")],
    ["an artist-only account", accountRow("ARTIST", null)],
    ["a CLIENT account with no linked profile", accountRow("CLIENT", null)],
  ])("returns the same success without issuing or sending for %s", async (_label, account) => {
    prismaMock.account.findUnique.mockResolvedValue(account);

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(issueEmailOtp).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("returns the same success without sending when the issue is blocked (cooldown, cap, lost race)", async () => {
    prismaMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", "client_profile_1"));
    vi.mocked(issueEmailOtp).mockResolvedValue({ issued: false });

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("still succeeds when the send fails, logging nothing of its own", async () => {
    givenEligibleAccount();
    vi.mocked(sendVerificationEmail).mockResolvedValue({ success: false });

    const result = await runPastFloor();

    expect(result).toEqual(SUCCESS);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("abandons a send that misses the timeout and still answers at the floor", async () => {
    givenEligibleAccount();
    vi.mocked(sendVerificationEmail).mockReturnValue(new Promise(() => {}));

    const state = track(requestClientSignInCode({ email: EMAIL }));

    await vi.advanceTimersByTimeAsync(EMAIL_OTP_SEND_TIMEOUT_MS);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestClientSignInCode",
      reason: "send_timed_out",
    });
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(FLOOR - EMAIL_OTP_SEND_TIMEOUT_MS);
    expect(state.settled).toBe(true);
    expect(state.result).toEqual(SUCCESS);
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });

  it.each([
    ["an eligible send", givenEligibleAccount, SUCCESS],
    ["an ineligible address", () => prismaMock.account.findUnique.mockResolvedValue(null), SUCCESS],
    [
      "a DB failure",
      () => prismaMock.account.findUnique.mockRejectedValue(new Error("connection lost")),
      DB_ERROR,
    ],
  ])("holds the response floor for %s", async (_label, arrange, expected) => {
    arrange();

    const state = track(requestClientSignInCode({ email: EMAIL }));

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

    const state = track(requestClientSignInCode({ email: EMAIL }));

    await vi.advanceTimersByTimeAsync(slowLookupMs);
    expect(state.settled).toBe(true);
    expect(state.result).toEqual(SUCCESS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a generic error and logs only a fixed reason when the account lookup throws", async () => {
    prismaMock.account.findUnique.mockRejectedValue(new Error(`P2024 for ${EMAIL}`));

    const result = await runPastFloor();

    expect(result).toEqual(DB_ERROR);
    expect(issueEmailOtp).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestClientSignInCode",
      reason: "unexpected_failure",
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });

  it("returns the same generic error without sending when issuing the code throws", async () => {
    prismaMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", "client_profile_1"));
    vi.mocked(issueEmailOtp).mockRejectedValue(new Error(`P2002 for ${EMAIL}`));

    const result = await runPastFloor();

    expect(result).toEqual(DB_ERROR);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "requestClientSignInCode",
      reason: "unexpected_failure",
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
  });
});
