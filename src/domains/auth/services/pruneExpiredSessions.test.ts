import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_CLEANUP_BATCH_SIZE,
  SESSION_CLEANUP_MAX_BATCHES,
} from "../constants";
import { pruneExpiredSessions } from "./pruneExpiredSessions";

const executeRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRaw: (...args: unknown[]) => executeRawMock(...args),
  },
}));

describe("pruneExpiredSessions", () => {
  beforeEach(() => {
    executeRawMock.mockReset();
  });

  it("returns the deleted count for a single partial batch", async () => {
    executeRawMock.mockResolvedValueOnce(7);

    const result = await pruneExpiredSessions();

    expect(result).toBe(7);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it("loops full batches and terminates on a zero-row batch", async () => {
    executeRawMock
      .mockResolvedValueOnce(SESSION_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(SESSION_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(0);

    const result = await pruneExpiredSessions();

    expect(result).toBe(SESSION_CLEANUP_BATCH_SIZE * 2);
    expect(executeRawMock).toHaveBeenCalledTimes(3);
  });

  it("stops at SESSION_CLEANUP_MAX_BATCHES when every batch is full", async () => {
    executeRawMock.mockResolvedValue(SESSION_CLEANUP_BATCH_SIZE);

    const result = await pruneExpiredSessions();

    expect(executeRawMock).toHaveBeenCalledTimes(SESSION_CLEANUP_MAX_BATCHES);
    expect(result).toBe(SESSION_CLEANUP_BATCH_SIZE * SESSION_CLEANUP_MAX_BATCHES);
  });

  it("is a no-op returning 0 when no rows are expired", async () => {
    executeRawMock.mockResolvedValueOnce(0);

    const result = await pruneExpiredSessions();

    expect(result).toBe(0);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a database failure to the caller", async () => {
    executeRawMock.mockRejectedValueOnce(new Error("db down"));

    await expect(pruneExpiredSessions()).rejects.toThrow("db down");
  });
});
