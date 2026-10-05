import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import type { ClientProfile } from "@/generated/prisma/client";

import { resolveGuestClientProfile } from "./resolveGuestClientProfile";

// Mocked-Prisma unit test (architecture.md §7). The real unique-index
// behaviour on instagramHandle/email (and the concurrent-guest P2002 race)
// is a 28.3 integration-tier candidate.
describe("resolveGuestClientProfile", () => {
  const input = {
    instagramHandle: "new_handle",
    email: "new@example.com",
    phone: "555-0100",
    firstName: "Jordan",
    lastName: "Rivera",
    dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
  };

  function profile(overrides: Partial<ClientProfile> = {}): ClientProfile {
    return {
      id: "client-1",
      instagramHandle: "existing_handle",
      email: "existing@example.com",
      phone: null,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      ...overrides,
    } as ClientProfile;
  }

  it("creates a new profile when neither the handle nor the email match", async () => {
    prismaMock.clientProfile.findUnique.mockResolvedValue(null);
    const created = profile({ id: "new-client" });
    prismaMock.clientProfile.create.mockResolvedValue(created);

    const client = await resolveGuestClientProfile(input);

    expect(client).toBe(created);
    expect(prismaMock.clientProfile.findUnique).toHaveBeenNthCalledWith(1, {
      where: { instagramHandle: "new_handle" },
    });
    expect(prismaMock.clientProfile.findUnique).toHaveBeenNthCalledWith(2, {
      where: { email: "new@example.com" },
    });
    expect(prismaMock.clientProfile.create).toHaveBeenCalledWith({
      data: {
        instagramHandle: "new_handle",
        email: "new@example.com",
        phone: "555-0100",
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: input.dateOfBirth,
      },
    });
  });

  it("updates every field on a matching instagramHandle, unchanged from the original upsert", async () => {
    prismaMock.clientProfile.findUnique.mockResolvedValueOnce(
      profile({ id: "client-1", firstName: "Old" })
    );
    const updated = profile({ id: "client-1", firstName: "New" });
    prismaMock.clientProfile.update.mockResolvedValue(updated);

    const client = await resolveGuestClientProfile(input);

    expect(client).toBe(updated);
    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: {
        email: "new@example.com",
        phone: "555-0100",
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: input.dateOfBirth,
      },
    });
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
  });

  it("reuses the existing profile on a matching email under a different handle, filling only blanks", async () => {
    prismaMock.clientProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        profile({
          id: "client-1",
          instagramHandle: "personal",
          email: "new@example.com",
          firstName: "Existing",
          // phone / lastName / dateOfBirth left blank to exercise fill-in.
        })
      );
    const updated = profile({ id: "client-1" });
    prismaMock.clientProfile.update.mockResolvedValue(updated);

    const client = await resolveGuestClientProfile(input);

    expect(client).toBe(updated);
    // Never overwrites the handle or the already-set firstName.
    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: {
        phone: "555-0100",
        lastName: "Rivera",
        dateOfBirth: input.dateOfBirth,
      },
    });
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
  });

  it("does not overwrite an already-set phone with the submitted one on an email match", async () => {
    prismaMock.clientProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        profile({ id: "client-1", phone: "555-0400", firstName: "Existing" })
      );
    prismaMock.clientProfile.update.mockResolvedValue(profile());

    await resolveGuestClientProfile(input);

    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { lastName: "Rivera", dateOfBirth: input.dateOfBirth },
    });
  });

  it("returns the existing profile unchanged, without a write, when every field is already set", async () => {
    const existing = profile({
      id: "client-1",
      phone: "555-0400",
      firstName: "Jordan",
      lastName: "Rivera",
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
    });
    prismaMock.clientProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const client = await resolveGuestClientProfile({
      ...input,
      phone: "555-9999",
      firstName: "Different",
    });

    expect(client).toBe(existing);
    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
  });
});
