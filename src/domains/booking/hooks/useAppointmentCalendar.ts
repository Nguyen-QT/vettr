"use client";

import { useState, useSyncExternalStore } from "react";

import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

function subscribeToDesktopBreakpoint(onChange: () => void) {
  const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mediaQueryList.addEventListener("change", onChange);
  return () => mediaQueryList.removeEventListener("change", onChange);
}

function getIsDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getIsDesktopServerSnapshot() {
  // CLAUDE.md 19.1's split is a genuinely different interaction model
  // per platform, not one responsive layout -- there is no safe guess
  // for a server render, so the client re-renders into the correct
  // branch the instant useSyncExternalStore hydrates with the real
  // media query result. Defaulting to the mobile branch keeps that
  // first paint on the simpler, single-column layout either way.
  return false;
}

export type CalendarViewMode = "day" | "week";

// The mobile slide-in stack (CLAUDE.md 19.1's Mobile note) has exactly
// these three screens; the desktop persistent panel doesn't use this
// value at all -- it renders the detail/edit form in place instead of
// navigating between screens.
export type CalendarScreen = "list" | "detail" | "edit";

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Domain Hook & Logic (CLAUDE.md 19.1.3): orchestrates the state both
// the desktop master-detail view (19.1.4) and the mobile stacked
// agenda (19.1.5) share -- responsive breakpoint, selected date,
// selected appointment, day/week view mode, and edit-mode toggling.
// Pure state orchestration over an appointments array the caller
// already fetched (getUpcomingAppointments/getPastDueAppointments
// composed at the page level, same precedent as the existing
// appointments page) -- no domain services or business rules of its
// own. The mobile navigation stack (list -> detail -> edit) is
// derived from the same selectedAppointmentId/isEditing state rather
// than tracked separately, so desktop and mobile can never disagree
// about what's currently selected.
export function useAppointmentCalendar(appointments: UpcomingAppointmentSummary[]) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopBreakpoint,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot
  );

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const appointmentsForSelectedDate = appointments.filter((appointment) =>
    isSameCalendarDay(appointment.startTime, selectedDate)
  );

  const selectedAppointment =
    appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null;

  const screen: CalendarScreen = isEditing
    ? "edit"
    : selectedAppointmentId
      ? "detail"
      : "list";

  function selectAppointment(appointmentId: string | null) {
    setIsEditing(false);
    setSelectedAppointmentId(appointmentId);
  }

  function startEditing() {
    if (!selectedAppointmentId) return;
    setIsEditing(true);
  }

  function stopEditing() {
    setIsEditing(false);
  }

  // Back navigation (mobile stack only): edit -> detail -> list,
  // mirroring the top-left back control CLAUDE.md 19.1's Mobile note
  // describes. A no-op once already at "list" -- there's nothing above
  // it to go back to.
  function goBack() {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    if (selectedAppointmentId) {
      setSelectedAppointmentId(null);
    }
  }

  return {
    isDesktop,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    appointmentsForSelectedDate,
    selectedAppointmentId,
    selectedAppointment,
    selectAppointment,
    isEditing,
    startEditing,
    stopEditing,
    screen,
    goBack,
  };
}
