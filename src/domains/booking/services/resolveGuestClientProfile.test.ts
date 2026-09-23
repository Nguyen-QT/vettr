import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { resolveGuestClientProfile } from "./resolveGuestClientProfile";

// Hits the real local Postgres database, same as updateClientProfile.test.ts.
describe("resolveGuestClientProfile", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    await prisma.clientProfile.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  it("creates a new profile when neither the handle nor the email match", async () => {
    const suffix = randomUUID().slice(0, 8);

    const client = await resolveGuestClientProfile({
      instagramHandle: `new_handle_${suffix}`,
      email: `new_${suffix}@example.com`,
      phone: "555-0100",
      firstName: "Jordan",
      lastName: "Rivera",
      dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
    });
    createdIds.push(client.id);

    expect(client.instagramHandle).toBe(`new_handle_${suffix}`);
    expect(client.email).toBe(`new_${suffix}@example.com`);
  });

  it("updates every field on a matching instagramHandle, unchanged from the original upsert", async () => {
    const suffix = randomUUID().slice(0, 8);
    const existing = await prisma.clientProfile.create({
      data: {
        instagramHandle: `handle_${suffix}`,
        email: `old_${suffix}@example.com`,
        firstName: "Old",
        lastName: "Name",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
      },
    });
    createdIds.push(existing.id);

    const client = await resolveGuestClientProfile({
      instagramHandle: `handle_${suffix}`,
      email: `updated_${suffix}@example.com`,
      phone: "555-0200",
      firstName: "New",
      lastName: "Name2",
      dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
    });

    expect(client.id).toBe(existing.id);
    expect(client.email).toBe(`updated_${suffix}@example.com`);
    expect(client.phone).toBe("555-0200");
    expect(client.firstName).toBe("New");
    expect(client.lastName).toBe("Name2");
    expect(client.dateOfBirth?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });

  it("reuses the existing profile on a matching email under a different handle, filling only blanks", async () => {
    const suffix = randomUUID().slice(0, 8);
    const existing = await prisma.clientProfile.create({
      data: {
        instagramHandle: `personal_${suffix}`,
        email: `shared_${suffix}@example.com`,
        firstName: "Jordan",
        // lastName/dateOfBirth left blank to exercise the fill-in path.
      },
    });
    createdIds.push(existing.id);

    const client = await resolveGuestClientProfile({
      instagramHandle: `business_${suffix}`,
      email: `shared_${suffix}@example.com`,
      phone: "555-0300",
      firstName: "SomeoneElse",
      lastName: "Rivera",
      dateOfBirth: new Date("1995-06-15T00:00:00.000Z"),
    });

    expect(client.id).toBe(existing.id);
    // Handle stays whatever it already was -- never overwritten by an
    // email match, and it's unique so the submitted handle belongs to
    // nobody yet.
    expect(client.instagramHandle).toBe(`personal_${suffix}`);
    // Already-set field is untouched, not overwritten by the new
    // submission's value.
    expect(client.firstName).toBe("Jordan");
    // Blank fields get filled in from this submission.
    expect(client.phone).toBe("555-0300");
    expect(client.lastName).toBe("Rivera");
    expect(client.dateOfBirth?.toISOString().slice(0, 10)).toBe("1995-06-15");

    const rowCount = await prisma.clientProfile.count({
      where: { email: `shared_${suffix}@example.com` },
    });
    expect(rowCount).toBe(1);
  });

  it("returns the existing profile unchanged when every field is already set", async () => {
    const suffix = randomUUID().slice(0, 8);
    const existing = await prisma.clientProfile.create({
      data: {
        instagramHandle: `personal_${suffix}`,
        email: `complete_${suffix}@example.com`,
        phone: "555-0400",
        firstName: "Jordan",
        lastName: "Rivera",
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
      },
    });
    createdIds.push(existing.id);

    const client = await resolveGuestClientProfile({
      instagramHandle: `business_${suffix}`,
      email: `complete_${suffix}@example.com`,
      phone: "555-9999",
      firstName: "Different",
      lastName: "Different",
      dateOfBirth: new Date("1999-09-09T00:00:00.000Z"),
    });

    expect(client.id).toBe(existing.id);
    expect(client.phone).toBe("555-0400");
    expect(client.firstName).toBe("Jordan");
    expect(client.lastName).toBe("Rivera");
    expect(client.dateOfBirth?.toISOString().slice(0, 10)).toBe("1990-01-01");
  });
});
