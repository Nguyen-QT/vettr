import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE } from "../constants";
import { createConnectOnboardingLink } from "./createConnectOnboardingLink";

const createAccountMock = vi.fn();
const createAccountLinkMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: {
      create: (...args: unknown[]) => createAccountMock(...args),
    },
    accountLinks: {
      create: (...args: unknown[]) => createAccountLinkMock(...args),
    },
  },
}));

describe("createConnectOnboardingLink", () => {
  let artistId: string;

  beforeEach(async () => {
    createAccountMock.mockReset();
    createAccountLinkMock.mockReset();
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Onboarding Link Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates the Connect account first, then requests an onboarding link", async () => {
    createAccountMock.mockResolvedValue({ id: "acct_new" });
    createAccountLinkMock.mockResolvedValue({ url: "https://connect.stripe.com/setup/1" });

    const result = await createConnectOnboardingLink(artistId);

    expect(result).toEqual({
      success: true,
      url: "https://connect.stripe.com/setup/1",
    });
    expect(createAccountLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_new", type: "account_onboarding" })
    );
  });

  it("reuses an already-onboarded account without creating a new one", async () => {
    await prisma.artist.update({
      where: { id: artistId },
      data: { stripeConnectAccountId: "acct_existing" },
    });
    createAccountLinkMock.mockResolvedValue({ url: "https://connect.stripe.com/setup/2" });

    await createConnectOnboardingLink(artistId);

    expect(createAccountMock).not.toHaveBeenCalled();
    expect(createAccountLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" })
    );
  });

  it("reports failure when account creation fails", async () => {
    createAccountMock.mockRejectedValue(new Error("network error"));

    const result = await createConnectOnboardingLink(artistId);

    expect(result).toEqual({
      success: false,
      error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE,
    });
    expect(createAccountLinkMock).not.toHaveBeenCalled();
  });

  it("reports failure when the account link call itself throws", async () => {
    createAccountMock.mockResolvedValue({ id: "acct_new" });
    createAccountLinkMock.mockRejectedValue(new Error("network error"));

    const result = await createConnectOnboardingLink(artistId);

    expect(result).toEqual({
      success: false,
      error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE,
    });
  });
});
