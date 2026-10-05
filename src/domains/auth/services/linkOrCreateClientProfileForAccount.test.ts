import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import {
  ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE,
  CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE,
  SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";

// Mocked-Prisma unit test (architecture.md §7): the shared prismaMock's default
// $transaction passes itself to the callback, so tx.* calls land on prismaMock.*.
const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(),
}));

vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: mockRecordAuditEvent }));

const { linkOrCreateClientProfileForAccount } = await import(
  "./linkOrCreateClientProfileForAccount"
);

const ACCOUNT_ID = "account-1";
const ACCOUNT_EMAIL = "artist@example.com";

// Services read only a few fields, so stubs return that narrow shape.
function stubRow(
  method: { mockResolvedValue(v: never): unknown },
  row: unknown
): void {
  method.mockResolvedValue(row as never);
}

function stubFindUnique(
  impl: (args: { where: { instagramHandle?: string } }) => Promise<unknown>
): void {
  prismaMock.clientProfile.findUnique.mockImplementation(impl as never);
}

function mockAccount(clientProfileId: string | null) {
  stubRow(prismaMock.account.findUniqueOrThrow, {
    id: ACCOUNT_ID,
    email: ACCOUNT_EMAIL,
    clientProfileId,
  });
}

describe("linkOrCreateClientProfileForAccount", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
    expect(prismaMock.clientProfile.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "REJECTED",
      reasonCode: "ALREADY_HAS_CLIENT_PROFILE",
      accountId: ACCOUNT_ID,
    });
  });

  it("creates a new ClientProfile from the account's email when nothing matches", async () => {
    mockAccount(null);
    stubRow(prismaMock.clientProfile.findUnique, null);
    stubRow(prismaMock.clientProfile.create, { id: "new-cp" });

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "fresh_handle",
      phone: "555-1234",
    });

    expect(prismaMock.clientProfile.create).toHaveBeenCalledWith({
      data: {
        instagramHandle: "fresh_handle",
        email: ACCOUNT_EMAIL,
        phone: "555-1234",
        firstName: undefined,
        lastName: undefined,
        dateOfBirth: undefined,
      },
    });
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { clientProfileId: "new-cp" },
    });
    expect(result).toEqual({ success: true, clientProfileId: "new-cp" });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "SUCCESS",
      reasonCode: "CLIENT_PROFILE_CREATED",
      accountId: ACCOUNT_ID,
    });
    // Recorded only after the link write landed.
    expect(prismaMock.account.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecordAuditEvent.mock.invocationCallOrder[0]!
    );
  });

  it("links an unlinked handle match, filling only blank fields", async () => {
    mockAccount(null);
    stubFindUnique(({ where }) => {
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

    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "matched-cp" },
      data: { phone: "555-9999", lastName: "Filled" },
    });
    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { clientProfileId: "matched-cp" },
    });
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, clientProfileId: "matched-cp" });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "SUCCESS",
      reasonCode: "CLIENT_PROFILE_MATCHED_EXISTING",
      accountId: ACCOUNT_ID,
    });
  });

  it("returns failure when the handle match already belongs to another account", async () => {
    mockAccount(null);
    stubRow(prismaMock.clientProfile.findUnique, {
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
    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "REJECTED",
      reasonCode: "CLIENT_PROFILE_ALREADY_LINKED",
      accountId: ACCOUNT_ID,
    });
  });

  it("falls back to an unlinked email match without touching the existing handle", async () => {
    mockAccount(null);
    stubFindUnique(({ where }) => {
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

    expect(prismaMock.clientProfile.update).toHaveBeenCalledWith({
      where: { id: "matched-by-email" },
      data: { firstName: "Filled" },
    });
    expect(result).toEqual({ success: true, clientProfileId: "matched-by-email" });
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "SUCCESS",
      reasonCode: "CLIENT_PROFILE_MATCHED_EXISTING",
      accountId: ACCOUNT_ID,
    });
  });

  it("returns failure when the email match already belongs to another account", async () => {
    mockAccount(null);
    stubFindUnique(({ where }) => {
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
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith({
      eventType: "CLIENT_PROFILE_LINK",
      outcome: "REJECTED",
      reasonCode: "CLIENT_PROFILE_ALREADY_LINKED",
      accountId: ACCOUNT_ID,
    });
  });

  it("returns the generic error instead of throwing on an unexpected failure", async () => {
    prismaMock.account.findUniqueOrThrow.mockRejectedValue(new Error("connection lost"));

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "any_handle",
    });

    expect(result).toEqual({
      success: false,
      error: SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
    });
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain("Unexpected failure");
  });

  // Concurrent submits can both pass the "no match" lookup and collide
  // on create -- P2002 must get the same generic result, split in the
  // log only.
  it("returns the same generic error on a P2002 unique conflict, distinguishing it only in the log", async () => {
    mockAccount(null);
    stubRow(prismaMock.clientProfile.findUnique, null);
    prismaMock.clientProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    const result = await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "raced_handle",
    });

    expect(result).toEqual({
      success: false,
      error: SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE,
    });
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("unique conflict"),
      "P2002"
    );
  });

  it("never logs the account email or submitted instagram handle", async () => {
    mockAccount(null);
    stubRow(prismaMock.clientProfile.findUnique, null);
    prismaMock.clientProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      })
    );

    await linkOrCreateClientProfileForAccount(ACCOUNT_ID, {
      instagramHandle: "private_handle",
    });

    const logged = consoleErrorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain(ACCOUNT_ID);
    expect(logged).not.toContain(ACCOUNT_EMAIL);
    expect(logged).not.toContain("private_handle");
  });
});
