import { beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Import this module before importing the service/module under test (or
// anything else that imports "@/lib/prisma"). Vitest hoists vi.mock() calls
// to the top of the file that contains them, not across the whole import
// graph -- if "@/lib/prisma" is imported anywhere before this module runs,
// that earlier import wins and the real client is used unmocked.
export const prismaMock = mockDeep<PrismaClient>();

function applyDefaultTransactionMock(): void {
  prismaMock.$transaction.mockImplementation(
    ((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return (arg as (tx: PrismaClient) => unknown)(prismaMock);
    }) as PrismaClient["$transaction"],
  );
}

applyDefaultTransactionMock();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  mockReset(prismaMock);
  applyDefaultTransactionMock();
});

export type { Prisma };
