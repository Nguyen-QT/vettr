import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { deleteSession } from "./deleteSession";

// Mocked-Prisma unit test (architecture.md §7): assert the exact delete
// payload; "row no longer findable" was real-DB behavior, not service logic.
describe("deleteSession", () => {
  it("deletes the session by id", async () => {
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });

    await deleteSession("session-1");

    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { id: "session-1" },
    });
  });

  it("does not throw when the session id does not exist", async () => {
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteSession("missing-session")).resolves.toBeUndefined();
  });
});
