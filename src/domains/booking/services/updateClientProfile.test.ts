import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE } from "../constants";
import { updateClientProfile } from "./updateClientProfile";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("updateClientProfile", () => {
  let clientId: string;
  let otherClientId: string;

  beforeEach(async () => {
    clientId = randomUUID();
    otherClientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    await prisma.clientProfile.create({
      data: {
        id: otherClientId,
        instagramHandle: `test_client_${otherClientId.slice(0, 8)}`,
        email: `test_client_${otherClientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.clientProfile.delete({ where: { id: otherClientId } });
  });

  it("updates every field", async () => {
    const newHandle = `updated_${clientId.slice(0, 8)}`;

    const result = await updateClientProfile({
      clientProfileId: clientId,
      instagramHandle: newHandle,
      email: "updated@example.com",
      phone: "555-0100",
      firstName: "Jordan",
      lastName: "Rivera",
      dateOfBirth: "1995-06-15",
    });

    expect(result).toEqual({ success: true });

    const updated = await prisma.clientProfile.findUniqueOrThrow({
      where: { id: clientId },
    });
    expect(updated.instagramHandle).toBe(newHandle);
    expect(updated.email).toBe("updated@example.com");
    expect(updated.phone).toBe("555-0100");
    expect(updated.firstName).toBe("Jordan");
    expect(updated.lastName).toBe("Rivera");
    // UTC comparison, matching updateClientProfile's own UTC-midnight
    // construction for this pure calendar-date field.
    expect(updated.dateOfBirth?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });

  it("rejects an Instagram handle already used by another profile", async () => {
    const other = await prisma.clientProfile.findUniqueOrThrow({
      where: { id: otherClientId },
    });

    const result = await updateClientProfile({
      clientProfileId: clientId,
      instagramHandle: other.instagramHandle,
      email: "updated@example.com",
      firstName: "Jordan",
      lastName: "Rivera",
      dateOfBirth: "1995-06-15",
    });

    expect(result).toEqual({
      success: false,
      error: INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
    });
  });
});
