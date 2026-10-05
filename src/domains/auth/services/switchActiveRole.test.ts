import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordAuditEvent } from "./recordAuditEvent";
import { switchActiveRole } from "./switchActiveRole";

// Mocked-Prisma unit test (architecture.md §7). The service only reads a few
// session/account fields, so stubs return that narrow shape.
function stubSession(row: unknown): void {
  prismaMock.session.findUnique.mockResolvedValue(row as never);
}

vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

describe("switchActiveRole", () => {
  beforeEach(() => {
    vi.mocked(recordAuditEvent).mockClear();
  });

  it("switches an active session into a linked target role", async () => {
    stubSession({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { id: "account_1", artistId: "artist_1", clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "CLIENT");

    expect(result).toEqual({
      success: true,
      activeRole: "CLIENT",
      artistId: "artist_1",
      clientProfileId: "client_1",
    });
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: { activeRole: "CLIENT" },
    });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "ROLE_SWITCH",
      outcome: "SUCCESS",
      reasonCode: "ROLE_SWITCHED",
      accountId: "account_1",
      targetRole: "CLIENT",
    });
  });

  it("does not record a success event when the session update fails", async () => {
    stubSession({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { id: "account_1", artistId: "artist_1", clientProfileId: "client_1" },
    });
    prismaMock.session.update.mockRejectedValue(new Error("db down"));

    await expect(switchActiveRole("session_1", "CLIENT")).rejects.toThrow("db down");
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects switching into a role the account is not linked to", async () => {
    stubSession({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { id: "account_1", artistId: "artist_1", clientProfileId: null },
    });

    const result = await switchActiveRole("session_1", "CLIENT");

    expect(result).toEqual({
      success: false,
      error: "Account is not linked to a client profile.",
    });
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "ROLE_SWITCH",
      outcome: "REJECTED",
      reasonCode: "NOT_LINKED_TO_CLIENT",
      accountId: "account_1",
      targetRole: "CLIENT",
    });
  });

  it("rejects switching into ARTIST when the account has no linked artist", async () => {
    stubSession({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { id: "account_1", artistId: null, clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "ARTIST");

    expect(result).toEqual({
      success: false,
      error: "Account is not linked to an artist profile.",
    });
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "ROLE_SWITCH",
      outcome: "REJECTED",
      reasonCode: "NOT_LINKED_TO_ARTIST",
      accountId: "account_1",
      targetRole: "ARTIST",
    });
  });

  it("reports failure for an expired session without auditing", async () => {
    stubSession({
      id: "session_1",
      expiresAt: new Date(Date.now() - 60_000),
      account: { id: "account_1", artistId: "artist_1", clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "ARTIST");

    expect(result).toEqual({ success: false, error: "Session not found." });
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("reports failure for a session id that does not exist without auditing", async () => {
    stubSession(null);

    const result = await switchActiveRole("missing", "ARTIST");

    expect(result).toEqual({ success: false, error: "Session not found." });
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
