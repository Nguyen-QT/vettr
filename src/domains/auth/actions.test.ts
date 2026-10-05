import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must come before ./actions: owns the next/headers cookie store and the
// getSessionWithAccount mock (see authSessionMock.ts). next/navigation is
// deliberately left unmocked so redirect() throws the real NEXT_REDIRECT.
import {
  cookieStore,
  getSessionWithAccountMock,
  mockSignedIn,
  mockSignedOut,
  mockStaleCookie,
  TEST_SESSION_ID,
} from "@/testUtils/authSessionMock";
import { expectRedirect } from "@/testUtils/expectRedirect";

const {
  verifyEmailCodeMock,
  resendVerificationCodeMock,
  signupClientMock,
  loginClientMock,
  loginArtistMock,
  linkOrCreateClientProfileForAccountMock,
  switchActiveRoleMock,
  deleteSessionMock,
} = vi.hoisted(() => ({
  verifyEmailCodeMock: vi.fn(),
  resendVerificationCodeMock: vi.fn(),
  signupClientMock: vi.fn(),
  loginClientMock: vi.fn(),
  loginArtistMock: vi.fn(),
  linkOrCreateClientProfileForAccountMock: vi.fn(),
  switchActiveRoleMock: vi.fn(),
  deleteSessionMock: vi.fn(),
}));

vi.mock("./services/verifyEmailCode", () => ({ verifyEmailCode: verifyEmailCodeMock }));
vi.mock("./services/resendVerificationCode", () => ({
  resendVerificationCode: resendVerificationCodeMock,
}));
vi.mock("./services/deleteSession", () => ({ deleteSession: deleteSessionMock }));
vi.mock("./services/linkOrCreateClientProfileForAccount", () => ({
  linkOrCreateClientProfileForAccount: linkOrCreateClientProfileForAccountMock,
}));
vi.mock("./services/loginArtist", () => ({ loginArtist: loginArtistMock }));
vi.mock("./services/loginClient", () => ({ loginClient: loginClientMock }));
vi.mock("./services/signupClient", () => ({ signupClient: signupClientMock }));
vi.mock("./services/switchActiveRole", () => ({ switchActiveRole: switchActiveRoleMock }));

import {
  getCurrentSession,
  loginAction,
  loginClientAction,
  logoutAction,
  resendVerificationCodeAction,
  setUpClientProfileAction,
  signupClientAction,
  switchActiveRoleAction,
  verifyEmailCodeAction,
} from "./actions";
import {
  ARTIST_LOGIN_PATH,
  CLIENT_LOGIN_PATH,
  SESSION_COOKIE_NAME,
} from "./constants";

const cookieSet = cookieStore.set;

const validVerifyInput = {
  email: "client@example.com",
  code: "123456",
  password: "hunter2hunter2",
};

beforeEach(() => {
  vi.clearAllMocks();
});

const validCredentials = { email: "client@example.com", password: "hunter2hunter2" };

describe("signupClientAction", () => {
  it("returns pendingVerification and sets no cookie on success", async () => {
    signupClientMock.mockResolvedValue({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });

    const result = await signupClientAction(validCredentials);

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("passes a service failure through", async () => {
    signupClientMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await signupClientAction(validCredentials);

    expect(result).toEqual({ success: false, error: "nope" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects invalid input without calling the service", async () => {
    const result = await signupClientAction({ email: "bad", password: "x" });

    expect(result.success).toBe(false);
    expect(signupClientMock).not.toHaveBeenCalled();
  });
});

describe("loginClientAction", () => {
  it("returns pendingVerification and sets no cookie for an unverified account", async () => {
    loginClientMock.mockResolvedValue({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });

    const result = await loginClientAction(validCredentials);

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("sets the session cookie for a verified account", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");
    loginClientMock.mockResolvedValue({
      success: true,
      sessionId: "session-1",
      expiresAt,
      clientProfileId: "client-1",
    });

    const result = await loginClientAction(validCredentials);

    expect(result).toEqual({ success: true, clientProfileId: "client-1" });
    expect(cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "session-1",
      expect.objectContaining({ httpOnly: true, expires: expiresAt })
    );
  });

  it("passes a service failure through without a cookie", async () => {
    loginClientMock.mockResolvedValue({ success: false, error: "bad creds" });

    const result = await loginClientAction(validCredentials);

    expect(result).toEqual({ success: false, error: "bad creds" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects invalid input without calling the service", async () => {
    const result = await loginClientAction({ email: "bad" });

    expect(result.success).toBe(false);
    expect(loginClientMock).not.toHaveBeenCalled();
  });
});

describe("verifyEmailCodeAction", () => {
  it("sets the session cookie and returns clientProfileId on success", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");
    verifyEmailCodeMock.mockResolvedValue({
      success: true,
      sessionId: "session-1",
      expiresAt,
      clientProfileId: "client-1",
    });

    const result = await verifyEmailCodeAction(validVerifyInput);

    expect(result).toEqual({ success: true, clientProfileId: "client-1" });
    expect(verifyEmailCodeMock).toHaveBeenCalledWith(validVerifyInput);
    expect(cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "session-1",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt })
    );
  });

  it("returns the service error and sets no cookie on failure", async () => {
    verifyEmailCodeMock.mockResolvedValue({ success: false, error: "generic failure" });

    const result = await verifyEmailCodeAction(validVerifyInput);

    expect(result).toEqual({ success: false, error: "generic failure" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects invalid input without calling the service or setting a cookie", async () => {
    const result = await verifyEmailCodeAction({ ...validVerifyInput, code: "12" });

    expect(result).toEqual({ success: false, error: "Enter the 6-digit code." });
    expect(verifyEmailCodeMock).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("resendVerificationCodeAction", () => {
  it("passes a success result through", async () => {
    resendVerificationCodeMock.mockResolvedValue({ success: true });

    const result = await resendVerificationCodeAction({ email: "client@example.com" });

    expect(result).toEqual({ success: true });
    expect(resendVerificationCodeMock).toHaveBeenCalledWith({ email: "client@example.com" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("passes a service failure through", async () => {
    resendVerificationCodeMock.mockResolvedValue({ success: false, error: "try again" });

    const result = await resendVerificationCodeAction({ email: "client@example.com" });

    expect(result).toEqual({ success: false, error: "try again" });
  });

  it("rejects an invalid email without calling the service", async () => {
    const result = await resendVerificationCodeAction({ email: "nope" });

    expect(result.success).toBe(false);
    expect(resendVerificationCodeMock).not.toHaveBeenCalled();
  });
});

const LOGGED_OUT_ERROR = { success: false, error: "You must be logged in to do this." };

// Identity fields a hostile client could smuggle into a payload -- the
// action must derive identity from the session instead (validation.md §2).
const hostileIdentity = {
  accountId: "attacker-account",
  clientProfileId: "attacker-client",
  artistId: "attacker-artist",
  role: "ARTIST",
  userId: "attacker-user",
  sessionId: "attacker-session",
};

describe("loginAction", () => {
  const expiresAt = new Date("2030-01-01T00:00:00Z");

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets the session cookie and returns only the artistId on success", async () => {
    loginArtistMock.mockResolvedValue({
      success: true,
      sessionId: "session-1",
      expiresAt,
      artistId: "artist-1",
    });

    const result = await loginAction(validCredentials);

    expect(result).toEqual({ success: true, artistId: "artist-1" });
    expect(loginArtistMock).toHaveBeenCalledWith(validCredentials);
    expect(cookieSet).toHaveBeenCalledWith(SESSION_COOKIE_NAME, "session-1", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  });

  it("marks the cookie secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    loginArtistMock.mockResolvedValue({
      success: true,
      sessionId: "session-1",
      expiresAt,
      artistId: "artist-1",
    });

    await loginAction(validCredentials);

    expect(cookieSet).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "session-1",
      expect.objectContaining({ secure: true })
    );
  });

  it("passes a service failure through without a cookie", async () => {
    loginArtistMock.mockResolvedValue({ success: false, error: "bad creds" });

    const result = await loginAction(validCredentials);

    expect(result).toEqual({ success: false, error: "bad creds" });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects invalid input without calling the service or setting a cookie", async () => {
    const result = await loginAction({ email: "artist@example.com", password: "" });

    expect(result).toEqual({ success: false, error: "Password is required." });
    expect(loginArtistMock).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("setUpClientProfileAction", () => {
  const validProfileInput = {
    instagramHandle: "inked.client",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "07123456789",
    dateOfBirth: "1990-05-15",
  };

  it("rejects a signed-out caller without calling the service", async () => {
    mockSignedOut();

    const result = await setUpClientProfileAction(validProfileInput);

    expect(result).toEqual(LOGGED_OUT_ERROR);
    expect(linkOrCreateClientProfileForAccountMock).not.toHaveBeenCalled();
  });

  it("checks the session before parsing input", async () => {
    mockSignedOut();

    const result = await setUpClientProfileAction({ instagramHandle: "!!" });

    expect(result).toEqual(LOGGED_OUT_ERROR);
  });

  it("rejects a stale cookie without calling the service", async () => {
    mockStaleCookie();

    const result = await setUpClientProfileAction(validProfileInput);

    expect(result).toEqual(LOGGED_OUT_ERROR);
    expect(linkOrCreateClientProfileForAccountMock).not.toHaveBeenCalled();
  });

  it("delegates with the session accountId, ignoring identity in the payload", async () => {
    const session = mockSignedIn({
      accountId: "account-1",
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: null,
    });
    linkOrCreateClientProfileForAccountMock.mockResolvedValue({
      success: true,
      clientProfileId: "client-9",
    });

    const result = await setUpClientProfileAction({
      ...validProfileInput,
      ...hostileIdentity,
    });

    expect(result).toEqual({ success: true, clientProfileId: "client-9" });
    expect(linkOrCreateClientProfileForAccountMock).toHaveBeenCalledWith(session.accountId, {
      instagramHandle: "inked.client",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "07123456789",
      dateOfBirth: new Date("1990-05-15T00:00:00.000Z"),
    });
  });

  it("passes the parsed (normalised) handle and an undefined dateOfBirth when omitted", async () => {
    const session = mockSignedIn();
    linkOrCreateClientProfileForAccountMock.mockResolvedValue({
      success: true,
      clientProfileId: "client-1",
    });

    await setUpClientProfileAction({ instagramHandle: "@inked.client" });

    expect(linkOrCreateClientProfileForAccountMock).toHaveBeenCalledWith(session.accountId, {
      instagramHandle: "inked.client",
      dateOfBirth: undefined,
    });
  });

  it("passes a service failure through", async () => {
    mockSignedIn();
    linkOrCreateClientProfileForAccountMock.mockResolvedValue({
      success: false,
      error: "already linked",
    });

    const result = await setUpClientProfileAction(validProfileInput);

    expect(result).toEqual({ success: false, error: "already linked" });
  });

  it("rejects invalid input without calling the service", async () => {
    mockSignedIn();

    const result = await setUpClientProfileAction({ instagramHandle: ".bad." });

    expect(result).toEqual({ success: false, error: "Enter a valid Instagram handle." });
    expect(linkOrCreateClientProfileForAccountMock).not.toHaveBeenCalled();
  });

  it("never touches the session cookie", async () => {
    mockSignedIn();
    linkOrCreateClientProfileForAccountMock.mockResolvedValue({
      success: true,
      clientProfileId: "client-1",
    });

    await setUpClientProfileAction(validProfileInput);

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});

describe("switchActiveRoleAction", () => {
  it("rejects a signed-out caller without calling the service", async () => {
    mockSignedOut();

    const result = await switchActiveRoleAction({ targetRole: "CLIENT" });

    expect(result).toEqual(LOGGED_OUT_ERROR);
    expect(switchActiveRoleMock).not.toHaveBeenCalled();
  });

  it("delegates with the session's sessionId, ignoring one in the payload", async () => {
    const session = mockSignedIn();
    switchActiveRoleMock.mockResolvedValue({ success: false, error: "not linked" });

    await switchActiveRoleAction({ targetRole: "ARTIST", ...hostileIdentity });

    expect(switchActiveRoleMock).toHaveBeenCalledWith(session.sessionId, "ARTIST");
  });

  it("redirects to /client after switching into the client role", async () => {
    mockSignedIn({ activeRole: "ARTIST", artistId: "artist-1" });
    switchActiveRoleMock.mockResolvedValue({
      success: true,
      activeRole: "CLIENT",
      artistId: "artist-1",
      clientProfileId: "client-1",
    });

    await expectRedirect(switchActiveRoleAction({ targetRole: "CLIENT" }), "/client");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("redirects to the artist dashboard after switching into the artist role", async () => {
    mockSignedIn({ artistId: "artist-1" });
    switchActiveRoleMock.mockResolvedValue({
      success: true,
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: "client-1",
    });

    await expectRedirect(switchActiveRoleAction({ targetRole: "ARTIST" }), "/artist/artist-1");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("passes a service failure through without redirecting", async () => {
    mockSignedIn();
    switchActiveRoleMock.mockResolvedValue({ success: false, error: "not linked" });

    const result = await switchActiveRoleAction({ targetRole: "ARTIST" });

    expect(result).toEqual({ success: false, error: "not linked" });
  });

  it("rejects an invalid targetRole without calling the service", async () => {
    mockSignedIn();

    const result = await switchActiveRoleAction({ targetRole: "ADMIN" });

    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(switchActiveRoleMock).not.toHaveBeenCalled();
  });
});

describe("logoutAction", () => {
  it("revokes the session, clears the cookie and redirects a client session to client login", async () => {
    const session = mockSignedIn({ activeRole: "CLIENT" });

    await expectRedirect(logoutAction(), CLIENT_LOGIN_PATH);

    expect(getSessionWithAccountMock).toHaveBeenCalledWith(session.sessionId);
    expect(deleteSessionMock).toHaveBeenCalledWith(session.sessionId);
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("routes on activeRole, not the account's home role", async () => {
    const session = mockSignedIn({
      role: "CLIENT",
      activeRole: "ARTIST",
      artistId: "artist-1",
    });

    await expectRedirect(logoutAction(), ARTIST_LOGIN_PATH);

    expect(deleteSessionMock).toHaveBeenCalledWith(session.sessionId);
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("still revokes and clears a stale cookie, falling back to artist login", async () => {
    mockStaleCookie("stale-id");

    await expectRedirect(logoutAction(), ARTIST_LOGIN_PATH);

    expect(deleteSessionMock).toHaveBeenCalledWith("stale-id");
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });

  it("skips the session lookup and revoke when there is no cookie", async () => {
    mockSignedOut();

    await expectRedirect(logoutAction(), ARTIST_LOGIN_PATH);

    expect(getSessionWithAccountMock).not.toHaveBeenCalled();
    expect(deleteSessionMock).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});

describe("getCurrentSession", () => {
  it("returns the session behind the session cookie", async () => {
    const session = mockSignedIn();

    const result = await getCurrentSession();

    expect(result).toEqual(session);
    expect(cookieStore.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(getSessionWithAccountMock).toHaveBeenCalledWith(TEST_SESSION_ID);
  });

  it("returns null without a lookup when there is no cookie", async () => {
    mockSignedOut();

    expect(await getCurrentSession()).toBeNull();
    expect(getSessionWithAccountMock).not.toHaveBeenCalled();
  });

  it("returns null for a stale cookie", async () => {
    mockStaleCookie();

    expect(await getCurrentSession()).toBeNull();
  });
});
