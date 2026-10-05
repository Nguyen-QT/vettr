import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE } from "../constants";
import { updateClientProfile } from "./updateClientProfile";

// Mocked-Prisma unit test (architecture.md §7). The real unique-index
// enforcement behind the handle-conflict case is a 28.3 integration-tier
// candidate; here only the service's P2002 translation is asserted.
describe("updateClientProfile", () => {
  const input = {
    clientProfileId: "client-1",
    instagramHandle: "updated_handle",
    email: "updated@example.com",
    phone: "555-0100",
    firstName: "Jordan",
    lastName: "Rivera",
    dateOfBirth: "1995-06-15",
  };

  it("updates every field, building dateOfBirth as UTC midnight", async () => {
    prismaMock.clientProfile.update.mockResolvedValue({} as never);

    const result = await updateClientProfile(input);

    expect(result).toEqual({ success: true });
    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: {
        instagramHandle: "updated_handle",
        email: "updated@example.com",
        phone: "555-0100",
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
      },
    });
  });

  it("rejects an Instagram handle already used by another profile (P2002)", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const result = await updateClientProfile(input);

    expect(result).toEqual({
      success: false,
      error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
    });
  });

  it("rethrows any other error", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(new Error("db down"));

    await expect(updateClientProfile(input)).rejects.toThrow("db down");
  });
});
