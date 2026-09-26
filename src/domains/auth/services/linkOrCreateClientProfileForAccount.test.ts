import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
  CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
} from "../constants";

// First mocked-Prisma unit test in this domain (CLAUDE.md 26.1.2.4) --
// every sibling test in this folder hits real Postgres instead. This
// establishes the pattern testing.md's Database Mocking Mandate already
// calls for; migrating the existing suite is tracked as a separate,
// scoped follow-up rather than folded into this PR.
const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    account: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    clientProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
  },
}));

const { linkOrCreateClientProfileForAccount } = await import(
  "./linkOrCreateClientProfileForAccount"
);

const ACCOUNT_ID = "account-1";
const ACCOUNT_EMAIL = "artist@example.com";

function mockAccount(clientProfileId: string | null) {
  mockTx.account.findUniqueOrThrow.mockResolvedValue({
    id: ACCOUNT_ID,
    email: ACCOUNT_EMAIL,
    clientProfileId,
  });
}

describe("linkOrCreateClientProfileForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns failure without any writes when the account already has a linked ClientProfile", async () => {
    mockAccount("already-linked-cp");

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "new_handle",
    });

    expect(result).toEqual({
      success: false,
      error: ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
    });
    expect(mockTx.clientProfile.findUnique).not.toHaveBeenCalled();
    expect(mockTx.account.update).not.toHaveBeenCalled();
  });

  it("creates a new ClientProfile from the account's email when nothing matches", async () => {
    mockAccount(null);
    mockTx.clientProfile.findUnique.mockResolvedValue(null);
    mockTx.clientProfile.create.mockResolvedValue({ id: "new-cp" });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "fresh_handle",
      phone: "555-1234",
    });

    expect(mockTx.clientProfile.create).toHaveBeenCalledWith({
      data: {
        instagramHandle: "fresh_handle",
        email: ACCOUNT_EMAIL,
        phone: "555-1234",
        firstName: undefined,
        lastName: undefined,
        dateOfBirth: undefined,
      },
    });
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { clientProfileId: "new-cp" },
    });
    expect(result).toEqual({ success: true, clientProfileId: "new-cp" });
  });

  it("links an unlinked handle match, filling only blank fields", async () => {
    mockAccount(null);
    mockTx.clientProfile.findUnique.mockImplementation(({ where }) => {
      if (where.instagramHandle) {
        return Promise.resolve({
          id: "matched-cp",
          instagramHandle: "existing_handle",
          email: "other@example.com",
          phone: null,
          firstName: "Already",
          lastName: null,
          dateOfBirth: null,
          account: null,
        });
      }
      return Promise.resolve(null);
    });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "existing_handle",
      phone: "555-9999",
      firstName: "Ignored",
      lastName: "Filled",
    });

    expect(mockTx.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "matched-cp" },
      data: { phone: "555-9999", lastName: "Filled" },
    });
    expect(mockTx.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { clientProfileId: "matched-cp" },
    });
    expect(mockTx.clientProfile.create).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, clientProfileId: "matched-cp" });
  });

  it("returns failure when the handle match already belongs to another account", async () => {
    mockAccount(null);
    mockTx.clientProfile.findUnique.mockResolvedValue({
      id: "matched-cp",
      account: { id: "other-account" },
    });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "claimed_handle",
    });

    expect(result).toEqual({
      success: false,
      error: CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
    });
    expect(mockTx.clientProfile.update).not.toHaveBeenCalled();
    expect(mockTx.account.update).not.toHaveBeenCalled();
  });

  it("falls back to an unlinked email match without touching the existing handle", async () => {
    mockAccount(null);
    mockTx.clientProfile.findUnique.mockImplementation(({ where }) => {
      if (where.instagramHandle) return Promise.resolve(null);
      return Promise.resolve({
        id: "matched-by-email",
        instagramHandle: "their_original_handle",
        email: ACCOUNT_EMAIL,
        phone: null,
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        account: null,
      });
    });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "new_handle_they_typed",
      firstName: "Filled",
    });

    expect(mockTx.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "matched-by-email" },
      data: { firstName: "Filled" },
    });
    expect(result).toEqual({ success: true, clientProfileId: "matched-by-email" });
  });

  it("returns failure when the email match already belongs to another account", async () => {
    mockAccount(null);
    mockTx.clientProfile.findUnique.mockImplementation(({ where }) => {
      if (where.instagramHandle) return Promise.resolve(null);
      return Promise.resolve({
        id: "matched-by-email",
        account: { id: "other-account" },
      });
    });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "new_handle_they_typed",
    });

    expect(result).toEqual({
      success: false,
      error: CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
    });
    expect(mockTx.account.update).not.toHaveBeenCalled();
  });
});
