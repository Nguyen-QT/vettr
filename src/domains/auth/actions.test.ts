import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieSet, verifyEmailCodeMock, resendVerificationCodeMock } = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  verifyEmailCodeMock: vi.fn(),
  resendVerificationCodeMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./services/verifyEmailCode", () => ({ verifyEmailCode: verifyEmailCodeMock }));
vi.mock("./services/resendVerificationCode", () => ({
  resendVerificationCode: resendVerificationCodeMock,
}));
vi.mock("./services/deleteSession", () => ({ deleteSession: vi.fn() }));
vi.mock("./services/getSessionWithAccount", () => ({ getSessionWithAccount: vi.fn() }));
vi.mock("./services/linkOrCreateClientProfileForAccount", () => ({
  linkOrCreateClientProfileForAccount: vi.fn(),
}));
vi.mock("./services/loginArtist", () => ({ loginArtist: vi.fn() }));
vi.mock("./services/loginClient", () => ({ loginClient: vi.fn() }));
vi.mock("./services/signupClient", () => ({ signupClient: vi.fn() }));
vi.mock("./services/switchActiveRole", () => ({ switchActiveRole: vi.fn() }));

import { resendVerificationCodeAction, verifyEmailCodeAction } from "./actions";
import { SESSION_COOKIE_NAME } from "./constants";

const validVerifyInput = {
  email: "client@example.com",
  code: "123456",
  password: "hunter2hunter2",
};

beforeEach(() => {
  vi.clearAllMocks();
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
