import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getClientProfileContactDetails } from "./getClientProfileContactDetails";

describe("getClientProfileContactDetails", () => {
  let clientId: string;

  beforeEach(async () => {
    clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
        phone: "+1234567890",
        firstName: "Jamie",
        lastName: "Rivera",
        dateOfBirth: new Date("2000-01-01"),
      },
    });
  });

  afterEach(async () => {
    await prisma.clientProfile.delete({ where: { id: clientId } });
  });

  it("returns the client's contact and onboarding details", async () => {
    const result = await getClientProfileContactDetails(clientId);

    expect(result).toEqual({
      instagramHandle: `test_client_${clientId.slice(0, 8)}`,
      email: `test_client_${clientId.slice(0, 8)}@example.com`,
      phone: "+1234567890",
      firstName: "Jamie",
      lastName: "Rivera",
      dateOfBirth: new Date("2000-01-01"),
    });
  });

  it("returns null phone/onboarding fields when unset", async () => {
    const noPhoneClientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: noPhoneClientId,
        instagramHandle: `test_client_${noPhoneClientId.slice(0, 8)}`,
        email: `test_client_${noPhoneClientId.slice(0, 8)}@example.com`,
      },
    });

    const result = await getClientProfileContactDetails(noPhoneClientId);

    expect(result?.phone).toBeNull();
    expect(result?.firstName).toBeNull();
    expect(result?.lastName).toBeNull();
    expect(result?.dateOfBirth).toBeNull();

    await prisma.clientProfile.delete({ where: { id: noPhoneClientId } });
  });

  it("returns null for an id that does not exist", async () => {
    const result = await getClientProfileContactDetails(randomUUID());

    expect(result).toBeNull();
  });
});
