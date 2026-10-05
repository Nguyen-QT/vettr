import { describe, expect, it } from "vitest";

// Must come before anything importing next/headers (see authSessionMock.ts).
import {
  cookieStore,
  mockSignedIn,
  mockSignedOut,
  mockStaleCookie,
  TEST_SESSION_ID,
} from "./authSessionMock";

import { cookies } from "next/headers";

import { getSessionWithAccount } from "@/domains/auth/services/getSessionWithAccount";

describe("authSessionMock", () => {
  it("defaults to signed out after the per-test reset", async () => {
    const store = await cookies();
    expect(store.get("anything")).toBeUndefined();
    expect(await getSessionWithAccount(TEST_SESSION_ID)).toBeNull();
  });

  it("mockSignedIn wires the cookie and the session lookup, with overrides", async () => {
    const session = mockSignedIn({
      activeRole: "ARTIST",
      artistId: "artist-1",
    });

    const store = await cookies();
    expect(store.get("anything")).toEqual({ value: session.sessionId });
    await expect(getSessionWithAccount(session.sessionId)).resolves.toEqual(
      expect.objectContaining({ activeRole: "ARTIST", artistId: "artist-1" }),
    );
  });

  it("mockStaleCookie has a cookie but no session", async () => {
    mockStaleCookie("stale-id");

    const store = await cookies();
    expect(store.get("anything")).toEqual({ value: "stale-id" });
    expect(await getSessionWithAccount("stale-id")).toBeNull();
  });

  it("mockSignedOut clears a previously signed-in state", async () => {
    mockSignedIn();
    mockSignedOut();

    const store = await cookies();
    expect(store.get("anything")).toBeUndefined();
  });

  it("does not leak cookie writes between tests (write)", async () => {
    (await cookies()).set("a", "b");
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("does not leak cookie writes between tests (read)", () => {
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
