// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useClientSignup } from "./useClientSignup";

const signupClientActionMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  signupClientAction: (...args: unknown[]) => signupClientActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const EMAIL = "a+b@example.com";
const PASSWORD = "hunter2hunter2";

async function submit() {
  const hook = renderHook(() => useClientSignup());
  act(() => {
    hook.result.current.form.setValue("email", EMAIL);
    hook.result.current.form.setValue("password", PASSWORD);
  });
  await act(async () => {
    await hook.result.current.onSubmit();
  });
  return hook;
}

describe("useClientSignup", () => {
  beforeEach(() => {
    signupClientActionMock.mockReset();
    pushMock.mockReset();
  });

  it("redirects to the verify-email page with the encoded email on pendingVerification", async () => {
    signupClientActionMock.mockResolvedValue({
      success: true,
      pendingVerification: true,
      clientProfileId: "cp_1",
    });

    await submit();

    expect(signupClientActionMock).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/client/verify-email?email=a%2Bb%40example.com");
  });

  it("redirects to /client on an authenticated success", async () => {
    signupClientActionMock.mockResolvedValue({ success: true, clientProfileId: "cp_1" });

    await submit();

    expect(pushMock).toHaveBeenCalledWith("/client");
  });

  it("surfaces the server error and does not redirect on failure", async () => {
    signupClientActionMock.mockResolvedValue({ success: false, error: "Nope." });

    const { result } = await submit();

    expect(result.current.serverError).toBe("Nope.");
    expect(result.current.isSubmitting).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
