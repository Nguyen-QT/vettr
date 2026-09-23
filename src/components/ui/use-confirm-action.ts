"use client";

import { useRef, useState } from "react";

// Domain Hook & Logic (CLAUDE.md 9.1.2): generic "open a ConfirmDialog,
// then run whatever action the caller asked to confirm" orchestration,
// reusable by any existing action regardless of domain -- pure state
// management, no business rules of its own. requestConfirmation takes
// a plain callback (e.g. () => markNoShow()) rather than being generic
// over the action's own async shape, since every existing action hook
// (useAppointmentLifecycleActions, useClientBookingActions, ...)
// already manages its own isPending/error via useTransition -- this
// hook only gates the click, it doesn't duplicate that lifecycle.
export function useConfirmAction() {
  const [isOpen, setIsOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  function requestConfirmation(action: () => void) {
    pendingActionRef.current = action;
    setIsOpen(true);
  }

  function confirm() {
    pendingActionRef.current?.();
    pendingActionRef.current = null;
    setIsOpen(false);
  }

  function onOpenChange(open: boolean) {
    if (!open) {
      pendingActionRef.current = null;
      setIsOpen(false);
    }
  }

  return { isOpen, requestConfirmation, confirm, onOpenChange };
}
