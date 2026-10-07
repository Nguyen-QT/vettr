import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_OTP_CLEANUP_BATCH_SIZE,
  EMAIL_OTP_CLEANUP_MAX_BATCHES,
  EMAIL_OTP_SEND_WINDOW_MS,
} from "../constants";
import { pruneExpiredEmailOtpChallenges } from "./pruneExpiredEmailOtpChallenges";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const CUTOFF = new Date(NOW.getTime() - EMAIL_OTP_SEND_WINDOW_MS);

// Values bound into the nth tagged-template $executeRaw call (index 0 is
// the strings array).
function boundValues(callIndex: number): unknown[] {
  return prismaMock.$executeRaw.mock.calls[callIndex].slice(1);
}

// Mocked-Prisma unit test (architecture.md §7): the tagged-template
// $executeRaw is stubbed on the shared prismaMock, which is reset per test.
describe("pruneExpiredEmailOtpChallenges", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the deleted count for a single partial batch", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(7);

    const result = await pruneExpiredEmailOtpChallenges();

    expect(result).toBe(7);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("binds a send-window cutoff to both the outer predicate and the batch subquery", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    await pruneExpiredEmailOtpChallenges();

    expect(boundValues(0)).toEqual([CUTOFF, CUTOFF, EMAIL_OTP_CLEANUP_BATCH_SIZE]);
  });

  it("keeps the cutoff fixed across batches while the clock moves", async () => {
    prismaMock.$executeRaw
      .mockImplementationOnce(
        (() => {
          vi.setSystemTime(NOW.getTime() + 60_000);
          return Promise.resolve(EMAIL_OTP_CLEANUP_BATCH_SIZE);
        }) as never
      )
      .mockResolvedValueOnce(0);

    await pruneExpiredEmailOtpChallenges();

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
    expect(boundValues(1)).toEqual([CUTOFF, CUTOFF, EMAIL_OTP_CLEANUP_BATCH_SIZE]);
  });

  it("loops full batches and terminates on a zero-row batch", async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(EMAIL_OTP_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(EMAIL_OTP_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(0);

    const result = await pruneExpiredEmailOtpChallenges();

    expect(result).toBe(EMAIL_OTP_CLEANUP_BATCH_SIZE * 2);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("stops at EMAIL_OTP_CLEANUP_MAX_BATCHES when every batch is full", async () => {
    prismaMock.$executeRaw.mockResolvedValue(EMAIL_OTP_CLEANUP_BATCH_SIZE);

    const result = await pruneExpiredEmailOtpChallenges();

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(EMAIL_OTP_CLEANUP_MAX_BATCHES);
    expect(result).toBe(EMAIL_OTP_CLEANUP_BATCH_SIZE * EMAIL_OTP_CLEANUP_MAX_BATCHES);
  });

  it("is a no-op returning 0 when no rows are dead", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    const result = await pruneExpiredEmailOtpChallenges();

    expect(result).toBe(0);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("propagates a database failure and runs no further batches", async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(EMAIL_OTP_CLEANUP_BATCH_SIZE)
      .mockRejectedValueOnce(new Error("db down"));

    await expect(pruneExpiredEmailOtpChallenges()).rejects.toThrow("db down");
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
