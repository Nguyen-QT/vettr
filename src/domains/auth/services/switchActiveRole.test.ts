import { beforeEach, describe, expect, it, vi } from "vitest";

import { switchActiveRole } from "./switchActiveRole";

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

describe("switchActiveRole", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    updateMock.mockReset();
  });

  it("switches an active session into a linked target role", async () => {
    findUniqueMock.mockResolvedValue({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { artistId: "artist_1", clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "CLIENT");

    expect(result).toEqual({
      success: true,
      activeRole: "CLIENT",
      artistId: "artist_1",
      clientProfileId: "client_1",
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: { activeRole: "CLIENT" },
    });
  });

  it("rejects switching into a role the account is not linked to", async () => {
    findUniqueMock.mockResolvedValue({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { artistId: "artist_1", clientProfileId: null },
    });

    const result = await switchActiveRole("session_1", "CLIENT");

    expect(result).toEqual({
      success: false,
      error: "Account is not linked to a client profile.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects switching into ARTIST when the account has no linked artist", async () => {
    findUniqueMock.mockResolvedValue({
      id: "session_1",
      expiresAt: new Date(Date.now() + 60_000),
      account: { artistId: null, clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "ARTIST");

    expect(result).toEqual({
      success: false,
      error: "Account is not linked to an artist profile.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("reports failure for an expired session", async () => {
    findUniqueMock.mockResolvedValue({
      id: "session_1",
      expiresAt: new Date(Date.now() - 60_000),
      account: { artistId: "artist_1", clientProfileId: "client_1" },
    });

    const result = await switchActiveRole("session_1", "ARTIST");

    expect(result).toEqual({ success: false, error: "Session not found." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("reports failure for a session id that does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await switchActiveRole("missing", "ARTIST");

    expect(result).toEqual({ success: false, error: "Session not found." });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
