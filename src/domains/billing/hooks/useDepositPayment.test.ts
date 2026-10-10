// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE } from "@/domains/billing/constants";
import type { CreateDepositPaymentIntentResult } from "@/domains/billing/types";

import { useDepositPayment } from "./useDepositPayment";

const createDepositPaymentIntentActionMock = vi.fn();

vi.mock("@/domains/billing/actions", () => ({
  createDepositPaymentIntentAction: (...args: unknown[]) =>
    createDepositPaymentIntentActionMock(...args),
}));

const BOOKING_REQUEST_ID = "booking_1";

function deferred() {
  let resolve: (value: CreateDepositPaymentIntentResult) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<CreateDepositPaymentIntentResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function start(result: { current: ReturnType<typeof useDepositPayment> }) {
  await act(async () => {
    await result.current.startDepositPayment(BOOKING_REQUEST_ID);
  });
}

describe("useDepositPayment", () => {
  beforeEach(() => {
    createDepositPaymentIntentActionMock.mockReset();
  });

  it("sets clientSecret on a successful result", async () => {
    createDepositPaymentIntentActionMock.mockResolvedValue({
      success: true,
      clientSecret: "pi_1_secret_abc",
    });
    const { result } = renderHook(() => useDepositPayment());

    await start(result);

    expect(createDepositPaymentIntentActionMock).toHaveBeenCalledWith(BOOKING_REQUEST_ID);
    expect(result.current.clientSecret).toBe("pi_1_secret_abc");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets the result's error and resets isLoading on a failed result", async () => {
    createDepositPaymentIntentActionMock.mockResolvedValue({
      success: false,
      error: "The deposit for this booking has already been paid.",
    });
    const { result } = renderHook(() => useDepositPayment());

    await start(result);

    expect(result.current.error).toBe("The deposit for this booking has already been paid.");
    expect(result.current.clientSecret).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("sets the generic error and resets isLoading when the action call rejects", async () => {
    createDepositPaymentIntentActionMock.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() => useDepositPayment());

    await expect(start(result)).resolves.toBeUndefined();

    expect(result.current.error).toBe(DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE);
    expect(result.current.clientSecret).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("is loading while the call is in flight and stops once it rejects", async () => {
    const call = deferred();
    createDepositPaymentIntentActionMock.mockReturnValue(call.promise);
    const { result } = renderHook(() => useDepositPayment());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.startDepositPayment(BOOKING_REQUEST_ID);
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      call.reject(new Error("Failed to fetch"));
      await pending;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE);
  });

  it("clears the error on a retry after a rejection and then sets clientSecret", async () => {
    createDepositPaymentIntentActionMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { result } = renderHook(() => useDepositPayment());
    await start(result);
    expect(result.current.error).toBe(DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE);

    const retry = deferred();
    createDepositPaymentIntentActionMock.mockReturnValueOnce(retry.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.startDepositPayment(BOOKING_REQUEST_ID);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      retry.resolve({ success: true, clientSecret: "pi_1_secret_abc" });
      await pending;
    });

    expect(result.current.clientSecret).toBe("pi_1_secret_abc");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
