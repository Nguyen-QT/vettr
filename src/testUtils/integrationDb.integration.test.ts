import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { createIntegrationTracker, uniqueSuffix } from "./integrationDb";

// Self-test for the integration tier's isolation helper (28.3.2.1): proves
// wipe() removes exactly what a test created and nothing else, and that
// state does not bleed from one test to the next.
const tracker = createIntegrationTracker();
const bystander: { artistId?: string } = {};

describe("integration tracker isolation", () => {
  beforeEach(async () => {
    await tracker.wipe();
  });

  afterAll(async () => {
    await tracker.wipe();
    if (bystander.artistId) {
      await prisma.artist.deleteMany({ where: { id: bystander.artistId } });
    }
    await prisma.$disconnect();
  });

  it("creates uniquely-keyed rows so repeated creates never collide", async () => {
    const a = await tracker.createArtist();
    const b = await tracker.createArtist();
    expect(a.instagramHandle).not.toBe(b.instagramHandle);
    expect(a.email).not.toBe(b.email);
  });

  it("creates tracked rows (first half of the bleed check)", async () => {
    const artist = await tracker.createArtist();
    const client = await tracker.createClientProfile();
    await prisma.bookingRequest.create({
      data: {
        clientId: client.id,
        artistId: artist.id,
        tier: "TIER_2",
        minPrice: 50,
        maxPrice: 100,
      },
    });
    expect(await prisma.artist.count({ where: { id: artist.id } })).toBe(1);
  });

  it("finds none of the previous test's rows (second half of the bleed check)", async () => {
    // Vitest runs tests in a file sequentially in declaration order, so the
    // previous test's rows must have been removed by this test's beforeEach.
    expect(
      await prisma.bookingRequest.count({
        where: { artist: { instagramHandle: { startsWith: "it_artist_" } } },
      }),
    ).toBe(0);
    expect(
      await prisma.clientProfile.count({
        where: { instagramHandle: { startsWith: "it_client_" } },
      }),
    ).toBe(0);
  });

  it("does not delete untracked rows", async () => {
    const suffix = uniqueSuffix();
    const untracked = await prisma.artist.create({
      data: {
        name: "Untracked Bystander",
        instagramHandle: `it_bystander_${suffix}`,
        email: `it_bystander_${suffix}@example.com`,
      },
    });
    bystander.artistId = untracked.id;

    await tracker.createArtist();
    await tracker.wipe();

    expect(await prisma.artist.count({ where: { id: untracked.id } })).toBe(1);
  });

  it("removes accounts linked to tracked rows, with their sessions", async () => {
    const artist = await tracker.createArtist();
    const account = await prisma.account.create({
      data: {
        email: `it_account_${uniqueSuffix()}@example.com`,
        passwordHash: "x",
        role: "ARTIST",
        artistId: artist.id,
      },
    });
    await prisma.session.create({
      data: {
        accountId: account.id,
        activeRole: "ARTIST",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await tracker.wipe();

    expect(await prisma.account.count({ where: { id: account.id } })).toBe(0);
    expect(
      await prisma.session.count({ where: { accountId: account.id } }),
    ).toBe(0);
    expect(await prisma.artist.count({ where: { id: artist.id } })).toBe(0);
  });
});
