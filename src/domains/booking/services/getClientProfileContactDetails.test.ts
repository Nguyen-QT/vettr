import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getClientProfileContactDetails } from "./getClientProfileContactDetails";

// Mocked-Prisma unit test (architecture.md §7).
describe("getClientProfileContactDetails", () => {
  it("returns the client's contact and onboarding details", async () => {
    const details = {
      instagramHandle: "test_client",
      email: "test_client@example.com",
      phone: "+1234567890",
      firstName: "Jamie",
      lastName: "Rivera",
      dateOfBirth: new Date("2000-01-01"),
    };
    prismaMock.clientProfile.findUnique.mockResolvedValue(details as never);

    const result = await getClientProfileContactDetails("client-1");

    expect(prismaMock.clientProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client-1" } })
    );
    expect(result).toEqual(details);
  });

  it("returns null phone/onboarding fields when unset", async () => {
    prismaMock.clientProfile.findUnique.mockResolvedValue({
      instagramHandle: "test_client",
      email: "test_client@example.com",
      phone: null,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
    } as never);

    const result = await getClientProfileContactDetails("client-1");

    expect(result?.phone).toBeNull();
    expect(result?.firstName).toBeNull();
    expect(result?.lastName).toBeNull();
    expect(result?.dateOfBirth).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    prismaMock.clientProfile.findUnique.mockResolvedValue(null);

    const result = await getClientProfileContactDetails("missing");

    expect(result).toBeNull();
  });
});
