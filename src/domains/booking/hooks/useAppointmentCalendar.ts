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
  // for a server render, and guessing wrong (e.g. defaulting to mobile)
  // means a desktop visitor's first paint flashes the wrong component
  // tree before useSyncExternalStore resolves. null means "not yet
  // determined" -- the view layer should render a neutral loading
  // state until this becomes a real boolean, not either branch.
  return null;
}

export type CalendarViewMode = "day" | "week" | "month";

// The mobile slide-in stack (CLAUDE.md 19.1's Mobile note) has exactly
// these three screens; the desktop persistent panel doesn't use this
// value at all -- it renders the detail/edit form in place instead of
// navigating between screens.
export type CalendarScreen = "list" | "detail" | "edit";

export function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// isSameCalendarDay compares local-timezone calendar days, which is
// correct for "same day in the artist's own timezone" -- but only if
// selectedDate itself is always local-midnight. Routing every update
// through this normalizer means a future caller constructing a date
// from e.g. new Date("2026-09-24") (UTC midnight, which can land on
// the previous local day west of UTC) can't silently break that
// comparison.
function toLocalMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
//
// Self-healing selection: if appointments is re-fetched (e.g. after a
// mutation) and no longer contains the currently selected id, the
// selection and any in-progress edit are cleared during that same
// render -- rather than left dangling, which would either show a
// blank detail panel or, if an appointment with that id ever
// reappeared later, silently drop the user back into detail/edit for
// it. This uses React's render-time "adjust state when a prop
// changes" pattern instead of a useEffect, so there's no extra
// stale-content frame and no react-hooks/set-state-in-effect trip.
export function useAppointmentCalendar<T extends UpcomingAppointmentSummary>(appointments: T[]) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopBreakpoint,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot
  );

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [prevAppointments, setPrevAppointments] = useState(appointments);
  if (appointments !== prevAppointments) {
    setPrevAppointments(appointments);
    if (
      selectedAppointmentId &&
      !appointments.some((appointment) => appointment.id === selectedAppointmentId)
    ) {
      setSelectedAppointmentId(null);
      setIsEditing(false);
    }
  }

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

  function selectDate(date: Date) {
    const normalized = toLocalMidnight(date);
    setSelectedDate(normalized);
    // Navigating to a different date invalidates a selected appointment
    // that isn't on it -- otherwise the detail panel keeps showing an
    // appointment from a date the artist has since navigated away from.
    if (
      selectedAppointmentId &&
      !appointments.some(
        (appointment) =>
          appointment.id === selectedAppointmentId &&
          isSameCalendarDay(appointment.startTime, normalized)
      )
    ) {
      setSelectedAppointmentId(null);
      setIsEditing(false);
    }
  }

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
    selectDate,
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
