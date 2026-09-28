// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSetUpClientProfile } from "./useSetUpClientProfile";

const setUpClientProfileActionMock = vi.fn();

vi.mock("@/domains/auth/actions", () => ({
  setUpClientProfileAction: (...args: unknown[]) => setUpClientProfileActionMock(...args),
}));

function submit(result: { current: ReturnType<typeof useSetUpClientProfile> }) {
  const event = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
  return act(async () => {
    await result.current.onSubmit(event);
  });
}

describe("useSetUpClientProfile", () => {
  beforeEach(() => {
    setUpClientProfileActionMock.mockReset();
  });

  it("rejects an empty instagramHandle without calling the action", async () => {
    const { result } = renderHook(() => useSetUpClientProfile());

    await submit(result);

    expect(result.current.errors.instagramHandle?.message).toBe("Instagram handle is required.");
    expect(setUpClientProfileActionMock).not.toHaveBeenCalled();
  });

  it("sends blank optional fields as undefined, not empty strings", async () => {
    setUpClientProfileActionMock.mockResolvedValue({ success: true, clientProfileId: "client_1" });
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });
    await submit(result);

    expect(setUpClientProfileActionMock).toHaveBeenCalledWith({
      instagramHandle: "vettr_hq",
      phone: undefined,
      firstName: undefined,
      lastName: undefined,
      dateOfBirth: undefined,
    });
  });

  it("sets isSuccess and clientProfileId, and clears isPending, on a successful result", async () => {
    setUpClientProfileActionMock.mockResolvedValue({ success: true, clientProfileId: "client_1" });
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });
    await submit(result);

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.clientProfileId).toBe("client_1");
    expect(result.current.isPending).toBe(false);
  });

  it("sets serverError and clears isPending, leaving isSuccess false, on a failed result", async () => {
    setUpClientProfileActionMock.mockResolvedValue({ success: false, error: "Handle already linked." });
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });
    await submit(result);

    expect(result.current.serverError).toBe("Handle already linked.");
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it("clears a stale serverError once the user edits a field again", async () => {
    setUpClientProfileActionMock.mockResolvedValue({ success: false, error: "Handle already linked." });
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });
    await submit(result);
    expect(result.current.serverError).toBe("Handle already linked.");

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq_2");
    });

    expect(result.current.serverError).toBeUndefined();
  });

  it("clears a stale isSuccess once the user edits a field again after success", async () => {
    setUpClientProfileActionMock.mockResolvedValue({ success: true, clientProfileId: "client_1" });
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });
    await submit(result);
    expect(result.current.isSuccess).toBe(true);

    act(() => {
      result.current.onFieldChange("firstName", "Jamie");
    });

    expect(result.current.isSuccess).toBe(false);
  });

  it("ignores a resubmit while a submission is already pending", async () => {
    let resolveAction: (value: { success: true; clientProfileId: string }) => void = () => {};
    setUpClientProfileActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      })
    );
    const { result } = renderHook(() => useSetUpClientProfile());

    act(() => {
      result.current.onFieldChange("instagramHandle", "vettr_hq");
    });

    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
    let firstSubmit!: Promise<void>;
    act(() => {
      firstSubmit = result.current.onSubmit(event);
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      await result.current.onSubmit(event);
    });

    act(() => {
      resolveAction({ success: true, clientProfileId: "client_1" });
    });
    await act(async () => {
      await firstSubmit;
    });

    expect(setUpClientProfileActionMock).toHaveBeenCalledTimes(1);
  });
});
