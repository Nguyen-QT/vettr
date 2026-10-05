import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Mocked-Prisma unit test (architecture.md §7). The sibling billing
// service createArtistConnectAccount runs for real against prismaMock.
describe("createConnectOnboardingLink", () => {
  const artistId = "artist-1";

  function artistRow(stripeConnectAccountId: string | null): never {
    return {
      stripeConnectAccountId,
      email: "artist-1@example.com",
    } as never;
  }

  beforeEach(() => {
    createAccountMock.mockReset();
    createAccountLinkMock.mockReset();
  });

  it("creates the Connect account first, then requests an onboarding link", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(artistRow(null));
    prismaMock.artist.update.mockResolvedValue({} as never);
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
    prismaMock.artist.findUnique.mockResolvedValue(artistRow("acct_existing"));
    createAccountLinkMock.mockResolvedValue({ url: "https://connect.stripe.com/setup/2" });

    await createConnectOnboardingLink(artistId);

    expect(createAccountMock).not.toHaveBeenCalled();
    expect(createAccountLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing" })
    );
  });

  it("reports failure when account creation fails", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(artistRow(null));
    createAccountMock.mockRejectedValue(new Error("network error"));

    const result = await createConnectOnboardingLink(artistId);

    expect(result).toEqual({
      success: false,
      error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE,
    });
    expect(createAccountLinkMock).not.toHaveBeenCalled();
  });

  it("reports failure when the account link call itself throws", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(artistRow(null));
    prismaMock.artist.update.mockResolvedValue({} as never);
    createAccountMock.mockResolvedValue({ id: "acct_new" });
    createAccountLinkMock.mockRejectedValue(new Error("network error"));

    const result = await createConnectOnboardingLink(artistId);

    expect(result).toEqual({
      success: false,
      error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE,
    });
  });
});
