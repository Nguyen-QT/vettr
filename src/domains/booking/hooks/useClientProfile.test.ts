// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientProfileContactDetails } from "@/domains/booking/types";

import { useClientProfile } from "./useClientProfile";

const updateClientProfileActionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@/domains/booking/actions", () => ({
  updateClientProfileAction: (...args: unknown[]) => updateClientProfileActionMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const DETAILS: ClientProfileContactDetails = {
  instagramHandle: "inked.client",
  email: "client@example.com",
  phone: "07700900123",
  firstName: "Sam",
  lastName: "Taylor",
  dateOfBirth: new Date("1990-05-15T00:00:00.000Z"),
};

const BLANK_ONBOARDING_DETAILS: ClientProfileContactDetails = {
  instagramHandle: "inked.client",
  email: "client@example.com",
  phone: null,
  firstName: null,
  lastName: null,
  dateOfBirth: null,
};

const SAVE_ERROR = "Invalid profile details.";

function renderProfile(initialDetails: ClientProfileContactDetails = DETAILS) {
  return renderHook(() => useClientProfile({ initialDetails }));
}

async function save(hook: ReturnType<typeof renderProfile>) {
  await act(async () => {
    hook.result.current.save();
  });
}

describe("useClientProfile", () => {
  beforeEach(() => {
    updateClientProfileActionMock.mockReset();
    refreshMock.mockReset();
  });

  it("maps the initial details into editable fields without the email", () => {
    const hook = renderProfile();

    expect(hook.result.current.fields).toEqual({
      instagramHandle: "inked.client",
      phone: "07700900123",
      firstName: "Sam",
      lastName: "Taylor",
      dateOfBirth: "1990-05-15",
    });
    expect(hook.result.current.fields).not.toHaveProperty("email");
  });

  it("maps null onboarding fields to empty strings", () => {
    const hook = renderProfile(BLANK_ONBOARDING_DETAILS);

    expect(hook.result.current.fields).toEqual({
      instagramHandle: "inked.client",
      phone: "",
      firstName: "",
      lastName: "",
      dateOfBirth: "",
    });
  });

  it("saves the editable fields without the email, then refreshes", async () => {
    updateClientProfileActionMock.mockResolvedValue({ success: true });
    const hook = renderProfile();

    await save(hook);

    expect(updateClientProfileActionMock).toHaveBeenCalledTimes(1);
    const payload: unknown = updateClientProfileActionMock.mock.calls[0]?.[0];
    expect(payload).toEqual({
      instagramHandle: "inked.client",
      phone: "07700900123",
      firstName: "Sam",
      lastName: "Taylor",
      dateOfBirth: "1990-05-15",
    });
    expect(payload).not.toHaveProperty("email");
    expect(hook.result.current.saved).toBe(true);
    expect(hook.result.current.error).toBeNull();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("sends edited field values", async () => {
    updateClientProfileActionMock.mockResolvedValue({ success: true });
    const hook = renderProfile();

    act(() => {
      hook.result.current.setField("firstName", "Alex");
    });
    await save(hook);

    expect(updateClientProfileActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Alex" })
    );
  });

  it("sends a blank phone as undefined", async () => {
    updateClientProfileActionMock.mockResolvedValue({ success: true });
    const hook = renderProfile();

    act(() => {
      hook.result.current.setField("phone", "");
    });
    await save(hook);

    const payload: unknown = updateClientProfileActionMock.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ phone: undefined }));
  });

  it("surfaces an action failure without marking saved or refreshing", async () => {
    updateClientProfileActionMock.mockResolvedValue({ success: false, error: SAVE_ERROR });
    const hook = renderProfile();

    await save(hook);

    expect(hook.result.current.error).toBe(SAVE_ERROR);
    expect(hook.result.current.saved).toBe(false);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("clears saved when a field is edited after a successful save", async () => {
    updateClientProfileActionMock.mockResolvedValue({ success: true });
    const hook = renderProfile();

    await save(hook);
    expect(hook.result.current.saved).toBe(true);

    act(() => {
      hook.result.current.setField("lastName", "Jones");
    });

    expect(hook.result.current.saved).toBe(false);
  });
});
