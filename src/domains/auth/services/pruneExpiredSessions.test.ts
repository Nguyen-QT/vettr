import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import {
  SESSION_CLEANUP_BATCH_SIZE,
  SESSION_CLEANUP_MAX_BATCHES,
} from "../constants";
import { pruneExpiredSessions } from "./pruneExpiredSessions";

// Mocked-Prisma unit test (architecture.md §7): the tagged-template
// $executeRaw is stubbed on the shared prismaMock, which is reset per test.
describe("pruneExpiredSessions", () => {
  it("returns the deleted count for a single partial batch", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(7);

    const result = await pruneExpiredSessions();

    expect(result).toBe(7);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("loops full batches and terminates on a zero-row batch", async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(SESSION_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(SESSION_CLEANUP_BATCH_SIZE)
      .mockResolvedValueOnce(0);

    const result = await pruneExpiredSessions();

    expect(result).toBe(SESSION_CLEANUP_BATCH_SIZE * 2);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("stops at SESSION_CLEANUP_MAX_BATCHES when every batch is full", async () => {
    prismaMock.$executeRaw.mockResolvedValue(SESSION_CLEANUP_BATCH_SIZE);

    const result = await pruneExpiredSessions();

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(SESSION_CLEANUP_MAX_BATCHES);
    expect(result).toBe(SESSION_CLEANUP_BATCH_SIZE * SESSION_CLEANUP_MAX_BATCHES);
  });

  it("is a no-op returning 0 when no rows are expired", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    const result = await pruneExpiredSessions();

    expect(result).toBe(0);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("propagates a database failure to the caller", async () => {
    prismaMock.$executeRaw.mockRejectedValueOnce(new Error("db down"));

    await expect(pruneExpiredSessions()).rejects.toThrow("db down");
  });
});
