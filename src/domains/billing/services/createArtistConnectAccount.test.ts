import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createArtistConnectAccount } from "./createArtistConnectAccount";

const createAccountMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      create: (...args: unknown[]) => createAccountMock(...args),
    },
  },
}));

// Mocked-Prisma unit test (architecture.md §7).
describe("createArtistConnectAccount", () => {
  const artistId = "artist-1";
  const email = "artist-1@example.com";

  beforeEach(() => {
    createAccountMock.mockReset();
  });

  it("creates a Connect Express account and persists its id", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: null,
      email,
    } as never);
    prismaMock.artist.update.mockResolvedValue({} as never);
    createAccountMock.mockResolvedValue({ id: "acct_new" });

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: true, stripeConnectAccountId: "acct_new" });
    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { id: artistId },
      select: { stripeConnectAccountId: true, email: true },
    });
    expect(createAccountMock).toHaveBeenCalledWith({ type: "express", email });
    expect(prismaMock.artist.update).toHaveBeenCalledWith({
      where: { id: artistId },
      data: { stripeConnectAccountId: "acct_new" },
    });
  });

  it("returns the existing account id without calling Stripe again", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: "acct_existing",
      email,
    } as never);

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({
      success: true,
      stripeConnectAccountId: "acct_existing",
    });
    expect(createAccountMock).not.toHaveBeenCalled();
    expect(prismaMock.artist.update).not.toHaveBeenCalled();
  });

  it("reports failure when the Stripe call itself throws", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: null,
      email,
    } as never);
    createAccountMock.mockRejectedValue(new Error("network error"));

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: false });
    expect(prismaMock.artist.update).not.toHaveBeenCalled();
  });

  it("still reports success when Stripe succeeded but the local persist write fails", async () => {
    prismaMock.artist.findUnique.mockResolvedValue({
      stripeConnectAccountId: null,
      email,
    } as never);
    createAccountMock.mockResolvedValue({ id: "acct_new" });
    prismaMock.artist.update.mockRejectedValue(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: true, stripeConnectAccountId: "acct_new" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("reports failure for an artist that does not exist", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    const result = await createArtistConnectAccount(artistId);

    expect(result).toEqual({ success: false });
    expect(createAccountMock).not.toHaveBeenCalled();
  });
});
