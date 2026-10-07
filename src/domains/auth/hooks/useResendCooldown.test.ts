// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_VERIFICATION_RESEND_COOLDOWN_MS } from "@/domains/auth/constants";

import { useResendCooldown } from "./useResendCooldown";

const COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;
const TICK_MS = 1000;
const ONE_HOUR_MS = 1000 * 60 * 60;

function renderStartedHook() {
  const hook = renderHook(() => useResendCooldown());
  act(() => {
    hook.result.current.start();
  });
  return hook;
}

describe("useResendCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts idle with no timer running", () => {
    const { result } = renderHook(() => useResendCooldown());

    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.isCoolingDown).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts at the full cooldown", () => {
    const { result } = renderStartedHook();

    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS);
    expect(result.current.isCoolingDown).toBe(true);
  });

  it("counts down once per second", () => {
    const { result } = renderStartedHook();

    act(() => {
      vi.advanceTimersByTime(3 * TICK_MS);
    });

    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS - 3);
  });

  it("reads 1 until the full cooldown has elapsed, then stops at 0 and clears its interval", () => {
    const { result } = renderStartedHook();

    act(() => {
      vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(1);
    expect(result.current.isCoolingDown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(0);
    expect(result.current.isCoolingDown).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5 * TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("restarts from the full cooldown when started mid-countdown, with one interval", () => {
    const { result } = renderStartedHook();
    act(() => {
      vi.advanceTimersByTime(20 * TICK_MS);
    });

    act(() => {
      result.current.start();
    });
    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS);
    expect(vi.getTimerCount()).toBe(1);

    // Ends a full cooldown after the restart, not after the first start.
    act(() => {
      vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(1);

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("keeps one interval when started twice in the same instant", () => {
    const { result } = renderStartedHook();

    act(() => {
      result.current.start();
    });

    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("starts again after a finished countdown", () => {
    const { result } = renderStartedHook();
    act(() => {
      vi.advanceTimersByTime(EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
    });
    expect(result.current.isCoolingDown).toBe(false);

    act(() => {
      result.current.start();
    });
    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS);

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS - 1);
  });

  describe("elapsed time, not tick count", () => {
    // Stands in for a throttled or suspended background tab: the monotonic
    // clock moves on while the interval misses its ticks.
    function startAt(now: number) {
      const nowSpy = vi.spyOn(performance, "now").mockReturnValue(now);
      const hook = renderStartedHook();
      return { ...hook, nowSpy };
    }

    it("catches up on the next tick after the tab missed ticks", () => {
      const { result, nowSpy } = startAt(10_000);

      nowSpy.mockReturnValue(10_000 + 45_000);
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS - 45);
    });

    it("still reads 1 with 1ms of the cooldown left", () => {
      const { result, nowSpy } = startAt(10_000);

      nowSpy.mockReturnValue(10_000 + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - 1);
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      expect(result.current.secondsRemaining).toBe(1);
    });

    it("ends on the next tick once the tab slept past the deadline", () => {
      const { result, nowSpy } = startAt(10_000);

      nowSpy.mockReturnValue(10_000 + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 30_000);
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      expect(result.current.secondsRemaining).toBe(0);
      expect(result.current.isCoolingDown).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("ignores system clock changes", () => {
    const { result } = renderStartedHook();

    act(() => {
      vi.setSystemTime(Date.now() - ONE_HOUR_MS);
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS - 1);

    act(() => {
      vi.setSystemTime(Date.now() + 2 * ONE_HOUR_MS);
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.secondsRemaining).toBe(COOLDOWN_SECONDS - 2);
  });

  it("clears its interval on unmount mid-countdown", () => {
    const { unmount } = renderStartedHook();
    act(() => {
      vi.advanceTimersByTime(5 * TICK_MS);
    });

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a stable start across rerenders", () => {
    const { result, rerender } = renderHook(() => useResendCooldown());
    const firstStart = result.current.start;

    act(() => {
      result.current.start();
    });
    rerender();

    expect(result.current.start).toBe(firstStart);
  });
});
