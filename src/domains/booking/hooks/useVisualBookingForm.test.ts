// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AESTHETIC_TAG_OPTIONS,
  COMPLEXITY_TIERS,
  TIER_BASELINE_BUDGETS,
} from "@/domains/booking/constants";
import type { ClientBookingInput } from "@/domains/booking/types";

import { useVisualBookingForm } from "./useVisualBookingForm";

const submitBookingRequestMock = vi.fn();
const getAvailableSlotsActionMock = vi.fn();

vi.mock("@/domains/booking/actions", () => ({
  submitBookingRequest: (...args: unknown[]) => submitBookingRequestMock(...args),
}));

vi.mock("@/domains/scheduling/actions", () => ({
  getAvailableSlotsAction: (...args: unknown[]) => getAvailableSlotsActionMock(...args),
}));

describe("useVisualBookingForm", () => {
  beforeEach(() => {
    submitBookingRequestMock.mockReset();
    getAvailableSlotsActionMock.mockReset();
  });

  it("defaults to TIER_2 and its baseline budget when no initialTier is given", () => {
    const { result } = renderHook(() => useVisualBookingForm({ artistId: "artist_1" }));

    expect(result.current.form.getValues("tier")).toBe("TIER_2");
    expect(result.current.form.getValues("clientBudgetRange")).toEqual(
      TIER_BASELINE_BUDGETS.TIER_2
    );
  });

  it.each(COMPLEXITY_TIERS)(
    "seeds tier and baseline budget from initialTier %s",
    (initialTier) => {
      const { result } = renderHook(() =>
        useVisualBookingForm({ artistId: "artist_1", initialTier })
      );

      expect(result.current.form.getValues("tier")).toBe(initialTier);
      expect(result.current.form.getValues("clientBudgetRange")).toEqual(
        TIER_BASELINE_BUDGETS[initialTier]
      );
    }
  );

  it("derives the aesthetic tag field and options from a FREESTYLE initialTier", () => {
    const { result } = renderHook(() =>
      useVisualBookingForm({ artistId: "artist_1", initialTier: "FREESTYLE" })
    );

    expect(result.current.isFreestyle).toBe(true);
    expect(result.current.activeTagField).toBe("aestheticTags");
    expect(result.current.activeTagOptions).toBe(AESTHETIC_TAG_OPTIONS);
  });

  it("never mutates the shared baseline constant when the budget changes", () => {
    const original = { ...TIER_BASELINE_BUDGETS.TIER_3 };
    const { result } = renderHook(() =>
      useVisualBookingForm({ artistId: "artist_1", initialTier: "TIER_3" })
    );

    act(() => {
      result.current.form.setValue("clientBudgetRange.minPrice", 999);
    });

    expect(result.current.form.getValues("clientBudgetRange.minPrice")).toBe(999);
    expect(TIER_BASELINE_BUDGETS.TIER_3).toEqual(original);
  });

  it("does not fetch availability on mount while no date is selected", () => {
    renderHook(() => useVisualBookingForm({ artistId: "artist_1", initialTier: "TIER_4" }));

    expect(getAvailableSlotsActionMock).not.toHaveBeenCalled();
  });

  // The resolver is the draft schema (54.5.6.1): an untouched optional phone
  // reports "" and must still let the draft through.
  it("accepts a blank phone as not provided and normalises the email", async () => {
    getAvailableSlotsActionMock.mockResolvedValue({ success: true, slots: [] });
    const { result } = renderHook(() => useVisualBookingForm({ artistId: "artist_1" }));
    const onValid = vi.fn<(draft: ClientBookingInput) => void>();

    // Setting the date fires the availability fetch.
    await act(async () => {
      const { form } = result.current;
      form.setValue("designTags", ["fine-line-detail"]);
      form.setValue("designReferenceImageUrls", ["https://example.com/reference.jpg"]);
      form.setValue("requestedDate", "2099-01-01");
      form.setValue("instagramHandle", "@client.handle");
      form.setValue("firstName", "Ada");
      form.setValue("lastName", "Lovelace");
      form.setValue("dateOfBirth", "1990-01-01");
      form.setValue("email", "  Client@Example.COM ");
      form.setValue("phone", "");
    });
    await act(async () => {
      await result.current.form.handleSubmit(onValid)();
    });

    expect(onValid).toHaveBeenCalledTimes(1);
    const draft = onValid.mock.calls[0]?.[0];
    expect(draft?.email).toBe("client@example.com");
    expect(draft?.phone).toBeUndefined();
  });
});
