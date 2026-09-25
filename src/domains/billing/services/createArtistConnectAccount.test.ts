import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { createArtistConnectAccount } from "./createArtistConnectAccount";

const createAccountMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      create: (...args: unknown[]) => createAccountMock(...args),
    },
  },
}));

describe("createArtistConnectAccount", () => {
  let artistId: string;

  beforeEach(async () => {
    createAccountMock.mockReset();
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Connect Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a Connect Express account and persists its id", async () => {
    createAccountMock.mockResolvedValue({ id: "acct_new" });

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: true, stripeConnectAccountId: "acct_new" });
    expect(createAccountMock).toHaveBeenCalledWith({
      type: "express",
      email: `${artistId}@example.com`,
    });

    const updated = await prisma.artist.findUnique({ where: { id: artistId } });
    expect(updated?.stripeConnectAccountId).toBe("acct_new");
  });

  it("returns the existing account id without calling Stripe again", async () => {
    await prisma.artist.update({
      where: { id: artistId },
      data: { stripeConnectAccountId: "acct_existing" },
    });

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({
      success: true,
      stripeConnectAccountId: "acct_existing",
    });
    expect(createAccountMock).not.toHaveBeenCalled();
  });

  it("reports failure when the Stripe call itself throws", async () => {
    createAccountMock.mockRejectedValue(new Error("network error"));

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: false });
    const updated = await prisma.artist.findUnique({ where: { id: artistId } });
    expect(updated?.stripeConnectAccountId).toBeNull();
  });

  it("reports failure for an artist that does not exist", async () => {
    const result = await createArtistConnectAccount(randomUUID());

    expect(result).toEqual({ success: false });
    expect(createAccountMock).not.toHaveBeenCalled();
  });
});
