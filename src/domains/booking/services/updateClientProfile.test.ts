import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import {
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  UPDATE_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import { updateClientProfile } from "./updateClientProfile";

const GENERIC_ERROR = {
  success: false,
  error: UPDATE_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
};

// Mocked-Prisma unit test (architecture.md §7). The real unique-index
// enforcement behind the handle-conflict case is a 28.3 integration-tier
// candidate; here only the service's P2002 translation is asserted.
describe("updateClientProfile", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const input = {
    clientProfileId: "client-1",
    instagramHandle: "updated_handle",
    phone: "555-0100",
    firstName: "Jordan",
    lastName: "Rivera",
    dateOfBirth: "1995-06-15",
  };

  function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
    // The message echoes PII, so the log assertions prove it's never logged.
    return new Prisma.PrismaClientKnownRequestError(
      `Failed for ${input.instagramHandle} ${input.firstName} ${input.lastName} ${input.phone}`,
      { code, clientVersion: "test" }
    );
  }

  it("updates every editable field, building dateOfBirth as UTC midnight", async () => {
    prismaMock.clientProfile.update.mockResolvedValue({} as never);

    const result = await updateClientProfile(input);

    expect(result).toEqual({ success: true });
    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: {
        instagramHandle: "updated_handle",
        phone: "555-0100",
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
      },
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("never writes an email a caller still passes at runtime", async () => {
    prismaMock.clientProfile.update.mockResolvedValue({} as never);
    // A spread of a wider object, as the action's `...parsed.data` does,
    // isn't excess-property checked -- the key can still arrive.
    const withEmail = { ...input, email: "someone-else@example.com" };

    await updateClientProfile(withEmail);

    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: expect.not.objectContaining({ email: expect.anything() }),
    });
  });

  it("rejects an Instagram handle already used by another profile (P2002) without logging", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(knownRequestError("P2002"));

    const result = await updateClientProfile(input);

    expect(result).toEqual({
      success: false,
      error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("returns the generic error and logs the Prisma code when the profile row is gone (P2025)", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(knownRequestError("P2025"));

    const result = await updateClientProfile(input);

    expect(result).toEqual(GENERIC_ERROR);
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [
        {
          operation: "updateClientProfile",
          reason: "unexpected_failure",
          clientProfileId: "client-1",
          errorCode: "P2025",
        },
      ],
    ]);
  });

  it("returns the generic error without a code for a non-Prisma failure", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(new Error("db down"));

    const result = await updateClientProfile(input);

    expect(result).toEqual(GENERIC_ERROR);
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [
        {
          operation: "updateClientProfile",
          reason: "unexpected_failure",
          clientProfileId: "client-1",
          errorCode: undefined,
        },
      ],
    ]);
  });

  it("never logs the client's details", async () => {
    prismaMock.clientProfile.update.mockRejectedValue(knownRequestError("P2025"));

    await updateClientProfile(input);

    const logged = JSON.stringify(consoleErrorSpy.mock.calls);
    for (const detail of [
      input.instagramHandle,
      input.phone,
      input.firstName,
      input.lastName,
      input.dateOfBirth,
    ]) {
      expect(logged).not.toContain(detail);
    }
  });
});
