// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COMPLEXITY_TIERS } from "@/domains/booking/constants";
import type { ClientBookingInput, ComplexityTier } from "@/domains/booking/types";

import {
  BOOKING_REQUEST_WIZARD_STEP_LABELS,
  DATE_SLOT_STEP,
  DETAILS_VERIFY_STEP,
  INTAKE_STEP,
  SERVICE_STEP,
  useBookingRequestWizard,
} from "./useBookingRequestWizard";
import { useVisualBookingForm } from "./useVisualBookingForm";

const submitBookingRequestMock = vi.fn();
const getAvailableSlotsActionMock = vi.fn();

vi.mock("@/domains/booking/actions", () => ({
  submitBookingRequest: (...args: unknown[]) => submitBookingRequestMock(...args),
}));

vi.mock("@/domains/scheduling/actions", () => ({
  getAvailableSlotsAction: (...args: unknown[]) => getAvailableSlotsActionMock(...args),
}));

const REFERENCE_IMAGE_URL = "https://example.com/reference.jpg";
// Fixed far-past/far-future dates, so no fake timers are needed for the
// schema's "in the future" rule.
const PAST_DATE = "2020-01-01";
const FUTURE_DATE = "2099-01-01";

// Composes the real form hook with the wizard, exactly as the
// BookingRequestWizard container (54.5.6.1) will.
function renderWizard(initialTier?: ComplexityTier) {
  return renderHook(
    ({ tier }: { tier?: ComplexityTier }) => {
      const { form } = useVisualBookingForm({ artistId: "artist_1", initialTier: tier });
      return { form, wizard: useBookingRequestWizard({ form, initialTier: tier }) };
    },
    { initialProps: { tier: initialTier } }
  );
}

// Reads the live error, not result.current.form.formState: nothing in this
// harness renders the fields, so formState.errors is never subscribed and
// its snapshot can be stale after trigger().
function fieldError(
  form: UseFormReturn<ClientBookingInput>,
  name: FieldPath<ClientBookingInput>
) {
  return form.getFieldState(name).error;
}

function fillValidIntake(form: UseFormReturn<ClientBookingInput>) {
  act(() => {
    form.setValue("designTags", ["fine-line-detail"]);
    form.setValue("designReferenceImageUrls", [REFERENCE_IMAGE_URL]);
  });
}

async function renderAtDateSlotStep() {
  const hook = renderWizard("TIER_2");
  fillValidIntake(hook.result.current.form);
  await act(async () => {
    await hook.result.current.wizard.goToNextStep();
  });
  return hook;
}

async function setRequestedDate(form: UseFormReturn<ClientBookingInput>, date: string) {
  // Setting a date fires useVisualBookingForm's availability fetch.
  await act(async () => {
    form.setValue("requestedDate", date);
  });
}

describe("useBookingRequestWizard", () => {
  beforeEach(() => {
    submitBookingRequestMock.mockReset();
    getAvailableSlotsActionMock.mockReset();
    getAvailableSlotsActionMock.mockResolvedValue({ success: true, slots: [] });
  });

  it("orders the steps Service, Intake, Date & Slot, Details & Verify", () => {
    const { result } = renderWizard();

    expect(result.current.wizard.stepLabels).toBe(BOOKING_REQUEST_WIZARD_STEP_LABELS);
    expect(BOOKING_REQUEST_WIZARD_STEP_LABELS[SERVICE_STEP]).toBe("Service");
    expect(BOOKING_REQUEST_WIZARD_STEP_LABELS[INTAKE_STEP]).toBe("Design & Budget");
    expect(BOOKING_REQUEST_WIZARD_STEP_LABELS[DATE_SLOT_STEP]).toBe("Date & Slot");
    expect(BOOKING_REQUEST_WIZARD_STEP_LABELS[DETAILS_VERIFY_STEP]).toBe("Details & Verify");
  });

  it("starts at Service when no service was preselected", () => {
    const { result } = renderWizard();

    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);
    expect(result.current.wizard.furthestStep).toBe(SERVICE_STEP);
    expect(result.current.wizard.isFirstStep).toBe(true);
    expect(result.current.wizard.isLastStep).toBe(false);
  });

  it.each(COMPLEXITY_TIERS)(
    "starts at Intake when ?service=%s preselected the tier, with Service still reachable",
    (initialTier) => {
      const { result } = renderWizard(initialTier);

      expect(result.current.wizard.currentStep).toBe(INTAKE_STEP);
      expect(result.current.wizard.furthestStep).toBe(INTAKE_STEP);
      expect(result.current.wizard.isFirstStep).toBe(false);

      act(() => {
        result.current.wizard.goToPreviousStep();
      });
      expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);

      act(() => {
        result.current.wizard.goToStep(INTAKE_STEP);
      });
      act(() => {
        result.current.wizard.goToStep(SERVICE_STEP);
      });
      expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);
    }
  );

  it("advances from Service to Intake once the tier is valid", async () => {
    const { result } = renderWizard();

    let advanced = false;
    await act(async () => {
      advanced = await result.current.wizard.goToNextStep();
    });

    expect(advanced).toBe(true);
    expect(result.current.wizard.currentStep).toBe(INTAKE_STEP);
    expect(result.current.wizard.furthestStep).toBe(INTAKE_STEP);
  });

  describe("Intake gate (details still blank)", () => {
    it("blocks with no design tags selected", async () => {
      const { result } = renderWizard("TIER_2");
      act(() => {
        result.current.form.setValue("designReferenceImageUrls", [REFERENCE_IMAGE_URL]);
      });

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(result.current.wizard.currentStep).toBe(INTAKE_STEP);
      expect(fieldError(result.current.form, "designTags")?.message).toBe(
        "Select at least one design tag."
      );
    });

    it("blocks a FREESTYLE request with no aesthetic tags selected", async () => {
      const { result } = renderWizard("FREESTYLE");
      act(() => {
        result.current.form.setValue("designReferenceImageUrls", [REFERENCE_IMAGE_URL]);
      });

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(fieldError(result.current.form, "aestheticTags")?.message).toBe(
        "Select at least one aesthetic theme tag."
      );
    });

    it('blocks "Other" with no notes', async () => {
      const { result } = renderWizard("TIER_2");
      act(() => {
        result.current.form.setValue("designTags", ["OTHER"]);
        result.current.form.setValue("designReferenceImageUrls", [REFERENCE_IMAGE_URL]);
      });

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(fieldError(result.current.form, "clientNotes")).toBeDefined();
    });

    it("blocks with no design reference image", async () => {
      const { result } = renderWizard("TIER_2");
      act(() => {
        result.current.form.setValue("designTags", ["fine-line-detail"]);
      });

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(result.current.wizard.currentStep).toBe(INTAKE_STEP);
      expect(fieldError(result.current.form, "designReferenceImageUrls")).toBeDefined();
    });

    it("advances to Date & Slot when valid, without surfacing later steps' errors", async () => {
      const { result } = await renderAtDateSlotStep();

      expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);
      expect(result.current.wizard.furthestStep).toBe(DATE_SLOT_STEP);
      expect(fieldError(result.current.form, "email")).toBeUndefined();
      expect(fieldError(result.current.form, "instagramHandle")).toBeUndefined();
      expect(fieldError(result.current.form, "requestedDate")).toBeUndefined();
    });
  });

  describe("Date & Slot gate (details still blank)", () => {
    it("blocks a date in the past", async () => {
      const { result } = await renderAtDateSlotStep();
      await setRequestedDate(result.current.form, PAST_DATE);

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);
      expect(fieldError(result.current.form, "requestedDate")?.message).toBe(
        "Choose a date and time in the future."
      );
    });

    it("blocks a must-finish-by time inside the minimum gap", async () => {
      const { result } = await renderAtDateSlotStep();
      await setRequestedDate(result.current.form, FUTURE_DATE);
      // The default requestedTime is 11:00; 12:00 leaves 60 of the 90
      // minutes MIN_MAX_END_TIME_GAP_MINUTES requires.
      act(() => {
        result.current.form.setValue("clientMaxEndTime", "12:00");
      });

      let advanced = true;
      await act(async () => {
        advanced = await result.current.wizard.goToNextStep();
      });

      expect(advanced).toBe(false);
      expect(fieldError(result.current.form, "clientMaxEndTime")).toBeDefined();
    });

    it("advances to Details & Verify, the last step, when valid", async () => {
      const { result } = await renderAtDateSlotStep();
      await setRequestedDate(result.current.form, FUTURE_DATE);

      await act(async () => {
        await result.current.wizard.goToNextStep();
      });

      expect(result.current.wizard.currentStep).toBe(DETAILS_VERIFY_STEP);
      expect(result.current.wizard.furthestStep).toBe(DETAILS_VERIFY_STEP);
      expect(result.current.wizard.isLastStep).toBe(true);
      expect(fieldError(result.current.form, "email")).toBeUndefined();
    });
  });

  it("never advances past the last step", async () => {
    const { result } = await renderAtDateSlotStep();
    await setRequestedDate(result.current.form, FUTURE_DATE);
    await act(async () => {
      await result.current.wizard.goToNextStep();
    });

    let advanced = false;
    await act(async () => {
      advanced = await result.current.wizard.goToNextStep();
    });

    expect(advanced).toBe(true);
    expect(result.current.wizard.currentStep).toBe(DETAILS_VERIFY_STEP);
  });

  it("floors Back at Service", () => {
    const { result } = renderWizard();

    act(() => {
      result.current.wizard.goToPreviousStep();
    });

    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);
  });

  it("only jumps to steps already reached", async () => {
    const { result } = renderWizard();

    act(() => {
      result.current.wizard.goToStep(DATE_SLOT_STEP);
    });
    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);

    await act(async () => {
      await result.current.wizard.goToNextStep();
    });
    fillValidIntake(result.current.form);
    await act(async () => {
      await result.current.wizard.goToNextStep();
    });
    expect(result.current.wizard.furthestStep).toBe(DATE_SLOT_STEP);

    act(() => {
      result.current.wizard.goToStep(SERVICE_STEP);
    });
    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);

    act(() => {
      result.current.wizard.goToStep(DATE_SLOT_STEP);
    });
    expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);

    act(() => {
      result.current.wizard.goToStep(DETAILS_VERIFY_STEP);
    });
    expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);

    act(() => {
      result.current.wizard.goToStep(-1);
    });
    expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);
  });

  it("keeps a Back made while Next is still validating", async () => {
    const { result } = renderWizard("TIER_2");
    fillValidIntake(result.current.form);

    await act(async () => {
      const pendingNext = result.current.wizard.goToNextStep();
      result.current.wizard.goToPreviousStep();
      await pendingNext;
    });

    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);
    expect(result.current.wizard.furthestStep).toBe(INTAKE_STEP);
  });

  it("advances exactly one step on a double-click of Next", async () => {
    const { result } = renderWizard("TIER_2");
    fillValidIntake(result.current.form);

    await act(async () => {
      await Promise.all([
        result.current.wizard.goToNextStep(),
        result.current.wizard.goToNextStep(),
      ]);
    });

    expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);
    expect(result.current.wizard.furthestStep).toBe(DATE_SLOT_STEP);
  });

  describe("goToFirstInvalidStep", () => {
    it("jumps to the earliest step owning an error, not the first error key", async () => {
      const { result } = await renderAtDateSlotStep();

      let jumped = false;
      act(() => {
        jumped = result.current.wizard.goToFirstInvalidStep({
          email: { message: "Enter a valid email address." },
          designTags: { message: "Select at least one design tag." },
        });
      });

      expect(jumped).toBe(true);
      expect(result.current.wizard.currentStep).toBe(INTAKE_STEP);
      expect(result.current.wizard.furthestStep).toBe(DATE_SLOT_STEP);
    });

    it("stays put and returns false when no error maps to a step", async () => {
      const { result } = await renderAtDateSlotStep();

      let jumped = true;
      act(() => {
        jumped = result.current.wizard.goToFirstInvalidStep({
          root: { message: "Something went wrong." },
        });
      });

      expect(jumped).toBe(false);
      expect(result.current.wizard.currentStep).toBe(DATE_SLOT_STEP);
    });
  });

  it("ignores initialTier changes after mount", () => {
    const { result, rerender } = renderWizard();

    rerender({ tier: "TIER_3" });
    expect(result.current.wizard.currentStep).toBe(SERVICE_STEP);

    const preselected = renderWizard("TIER_4");
    preselected.rerender({ tier: undefined });
    expect(preselected.result.current.wizard.currentStep).toBe(INTAKE_STEP);
  });
});
