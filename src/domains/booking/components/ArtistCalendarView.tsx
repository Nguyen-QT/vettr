"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { BackNav } from "@/components/ui/back-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import { AppointmentActions } from "@/domains/booking/components/AppointmentActions";
import { AppointmentDetail } from "@/domains/booking/components/AppointmentDetail";
import { AppointmentLifecycleActions } from "@/domains/booking/components/AppointmentLifecycleActions";
import { RescheduleForm } from "@/domains/booking/components/RescheduleForm";
import {
  type CalendarScreen,
  type CalendarViewMode,
  isSameCalendarDay,
  useAppointmentCalendar,
} from "@/domains/booking/hooks/useAppointmentCalendar";
import {
  addDays,
  addMonths,
  fromDateInputValue,
  startOfMonthGrid,
  startOfWeek,
  toDateInputValue,
} from "@/domains/booking/lib/calendarDates";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

// A read-only appointment can come from either getUpcomingAppointments
// or getPastDueAppointments (same UpcomingAppointmentSummary shape) --
// isPastDue is tagged server-side at compose time (CLAUDE.md 19.1.4's
// page) rather than re-derived from the client's own clock, since the
// artist page already knows definitively which query produced it.
export type CalendarAppointment = UpcomingAppointmentSummary & { isPastDue: boolean };

interface ArtistCalendarViewProps {
  artistId: string;
  appointments: CalendarAppointment[];
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const DAY_HEADING_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const APPOINTMENT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" });

// Screen "depth" (CLAUDE.md 19.1.5's mobile stack: list -> detail ->
// edit) -- used only to derive the slide direction for the
// AnimatePresence transition below, not part of useAppointmentCalendar
// itself since it's a pure UI/animation concern, not navigation state.
const SCREEN_DEPTH: Record<CalendarScreen, number> = { list: 0, detail: 1, edit: 2 };

interface CalendarNavigatorProps {
  viewMode: CalendarViewMode;
  setViewMode: (mode: CalendarViewMode) => void;
  selectedDate: Date;
  selectDate: (date: Date) => void;
  visibleDays: Date[];
  appointmentCountForDay: (day: Date) => number;
  prefersReducedMotion: boolean | null;
  shiftSelectedDate: (amount: number) => void;
  showDayOption: boolean;
}

// Shared nav header + day-cell grid (CLAUDE.md 19.1.4/19.1.5): the
// same week/month grid renders identically whether it's desktop's
// narrow left column or mobile's full-width collapsible strip -- only
// the surrounding container's width differs, handled by each caller.
// Mobile omits the "Day" toggle (showDayOption: false) -- the roadmap
// text only calls for a week/month strip there, day-by-day granularity
// isn't useful on a screen already showing one day's full list below.
function CalendarNavigator({
  viewMode,
  setViewMode,
  selectedDate,
  selectDate,
  visibleDays,
  appointmentCountForDay,
  prefersReducedMotion,
  shiftSelectedDate,
  showDayOption,
}: CalendarNavigatorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={viewMode === "week" ? "Previous week" : "Previous day"}
            onClick={() => shiftSelectedDate(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={viewMode === "week" ? "Next week" : "Next day"}
            onClick={() => shiftSelectedDate(1)}
          >
            <ChevronRightIcon />
          </Button>
          <Input
            type="date"
            aria-label="Jump to date"
            value={toDateInputValue(selectedDate)}
            onChange={(event) => {
              if (!event.target.value) return;
              selectDate(fromDateInputValue(event.target.value));
            }}
            className="w-auto"
          />
        </div>
        <div className="flex gap-1">
          {showDayOption ? (
            <Button
              type="button"
              variant={viewMode === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              Day
            </Button>
          ) : null}
          <Button
            type="button"
            variant={viewMode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("week")}
          >
            Week
          </Button>
          <Button
            type="button"
            variant={viewMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("month")}
          >
            Month
          </Button>
        </div>
      </div>

      {viewMode === "month" ? (
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {visibleDays.slice(0, 7).map((day) => (
            <span key={day.toDateString()}>{WEEKDAY_FORMAT.format(day)}</span>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-2",
          viewMode === "week" ? "grid-cols-7" : viewMode === "month" ? "grid-cols-7 gap-1" : "grid-cols-1"
        )}
      >
        {visibleDays.map((day) => {
          const isSelected = isSameCalendarDay(day, selectedDate);
          const isOutsideMonth = viewMode === "month" && day.getMonth() !== selectedDate.getMonth();
          const count = appointmentCountForDay(day);
          return (
            <button
              key={day.toDateString()}
              type="button"
              onClick={() => selectDate(day)}
              className={cn(
                "relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border p-2 text-sm",
                isSelected ? "border-primary" : "border-border bg-card",
                isOutsideMonth ? "text-muted-foreground/60" : null
              )}
            >
              {isSelected ? (
                <motion.div
                  layoutId="calendar-selected-day"
                  className="absolute inset-0 bg-primary/10"
                  transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                />
              ) : null}
              {viewMode !== "month" ? (
                <span className="relative text-xs text-muted-foreground">
                  {WEEKDAY_FORMAT.format(day)}
                </span>
              ) : null}
              <span className="relative font-medium">{day.getDate()}</span>
              {count > 0 ? (
                <span className="relative rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AppointmentDayListProps {
  selectedDate: Date;
  appointmentsForSelectedDate: CalendarAppointment[];
  selectedAppointmentId: string | null;
  onSelect: (appointmentId: string) => void;
  headingRef?: (element: HTMLHeadingElement | null) => void;
}

// The selected date's appointment list (CLAUDE.md 19.1.4/19.1.5),
// shared between desktop's left column and mobile's list screen.
function AppointmentDayList({
  selectedDate,
  appointmentsForSelectedDate,
  selectedAppointmentId,
  onSelect,
  headingRef,
}: AppointmentDayListProps) {
  return (
    <div className="flex flex-col gap-2">
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {DAY_HEADING_FORMAT.format(selectedDate)}
      </h2>
      {appointmentsForSelectedDate.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments on this day.</p>
      ) : (
        appointmentsForSelectedDate.map((appointment) => (
          <button
            key={appointment.id}
            type="button"
            onClick={() => onSelect(appointment.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left text-sm",
              selectedAppointmentId === appointment.id
                ? "border-primary bg-accent"
                : "border-border bg-card"
            )}
          >
            <span className="font-medium">
              {APPOINTMENT_TIME_FORMAT.format(appointment.startTime)}
            </span>
            <span className="text-muted-foreground">@{appointment.clientInstagramHandle}</span>
          </button>
        ))
      )}
    </div>
  );
}

interface MobileScreenHeaderProps {
  title: string;
  onBack: () => void;
}

// Top bar for the mobile detail/edit screens (CLAUDE.md 19.1.5) -- the
// back button autofocuses on mount (a plain HTML attribute, not an
// effect/setState) so each screen transition moves focus sensibly
// instead of leaving it on a now-offscreen control.
function MobileScreenHeader({ title, onBack }: MobileScreenHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <BackNav onClick={onBack} autoFocus />
      <h2 className="text-sm font-medium">{title}</h2>
    </div>
  );
}

// Direction-aware slide (CLAUDE.md 19.1.5): pushing to a deeper screen
// (list -> detail -> edit, direction >= 0) slides the new screen in
// from the right and the old one out to the left; popping back
// reverses it. Collapses to a plain crossfade with no offset when
// reduced motion is on, following the same formula image-lightbox.tsx
// already established (useReducedMotion() -> zero any positional
// offset) rather than skipping the transition outright.
function getSlideVariants(prefersReducedMotion: boolean) {
  return {
    enter: (direction: number) => ({
      x: prefersReducedMotion ? 0 : direction >= 0 ? "100%" : "-100%",
      opacity: prefersReducedMotion ? 1 : 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: prefersReducedMotion ? 0 : direction >= 0 ? "-100%" : "100%",
      opacity: prefersReducedMotion ? 1 : 0,
    }),
  };
}

// View (CLAUDE.md 19.1.4/19.1.5): the artist appointments calendar --
// a desktop (>=1024px) master-detail split, and a mobile (<1024px)
// stacked agenda (list -> detail -> edit) with slide transitions and
// top-left back navigation. Both branches share useAppointmentCalendar
// (19.1.3) and the presentation-only AppointmentDetail (19.1.2);
// mobile additionally consumes the hook's screen/goBack/startEditing,
// which the desktop panel has no equivalent of (it edits in place).
//
// isDesktop === null (still hydrating) renders a neutral placeholder
// instead of guessing at either layout.
export function ArtistCalendarView({ artistId, appointments }: ArtistCalendarViewProps) {
  const {
    isDesktop,
    selectedDate,
    selectDate,
    viewMode,
    setViewMode,
    appointmentsForSelectedDate,
    selectedAppointmentId,
    selectedAppointment,
    selectAppointment,
    screen,
    goBack,
    startEditing,
  } = useAppointmentCalendar(appointments);

  const prefersReducedMotion = useReducedMotion();

  // Direction-aware slide transitions (mobile only): tracked via the
  // same render-time "adjust state when a value changes" pattern
  // useAppointmentCalendar itself already uses for its self-healing
  // selection, rather than a useEffect -- direction needs to persist
  // across the renders that follow a screen change (for the duration
  // of the AnimatePresence transition), so it's its own piece of
  // state, not just a value recomputed fresh every render.
  const [prevScreen, setPrevScreen] = useState(screen);
  const [direction, setDirection] = useState(0);
  if (screen !== prevScreen) {
    setDirection(SCREEN_DEPTH[screen] > SCREEN_DEPTH[prevScreen] ? 1 : -1);
    setPrevScreen(screen);
  }

  if (isDesktop === null) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <p className="text-sm font-medium">Loading calendar…</p>
      </div>
    );
  }

  const visibleDays =
    viewMode === "month"
      ? Array.from({ length: 42 }, (_, index) => addDays(startOfMonthGrid(selectedDate), index))
      : viewMode === "week"
        ? Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selectedDate), index))
        : [selectedDate];

  function shiftSelectedDate(amount: number) {
    if (viewMode === "month") {
      selectDate(addMonths(selectedDate, amount));
      return;
    }
    selectDate(addDays(selectedDate, viewMode === "week" ? amount * 7 : amount));
  }

  function appointmentCountForDay(day: Date) {
    return appointments.filter((appointment) => isSameCalendarDay(appointment.startTime, day))
      .length;
  }

  if (!isDesktop) {
    const slideVariants = getSlideVariants(prefersReducedMotion ?? false);
    const transition = { duration: prefersReducedMotion ? 0.01 : 0.25 };

    return (
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {screen === "list" ? (
            <motion.div
              key="list"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="flex flex-col gap-4"
            >
              <CalendarNavigator
                viewMode={viewMode}
                setViewMode={setViewMode}
                selectedDate={selectedDate}
                selectDate={selectDate}
                visibleDays={visibleDays}
                appointmentCountForDay={appointmentCountForDay}
                prefersReducedMotion={prefersReducedMotion}
                shiftSelectedDate={shiftSelectedDate}
                showDayOption={false}
              />
              <Separator />
              <AppointmentDayList
                selectedDate={selectedDate}
                appointmentsForSelectedDate={appointmentsForSelectedDate}
                selectedAppointmentId={selectedAppointmentId}
                onSelect={selectAppointment}
              />
            </motion.div>
          ) : screen === "detail" && selectedAppointment ? (
            <motion.div
              key="detail"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="flex flex-col gap-4"
            >
              <MobileScreenHeader
                title={APPOINTMENT_TIME_FORMAT.format(selectedAppointment.startTime)}
                onBack={goBack}
              />
              <AppointmentDetail appointment={selectedAppointment} />
              <Separator />
              {selectedAppointment.isPastDue ? (
                <AppointmentLifecycleActions
                  artistId={artistId}
                  bookingRequestId={selectedAppointment.id}
                />
              ) : (
                <AppointmentActions
                  appointment={selectedAppointment}
                  onStartReschedule={startEditing}
                />
              )}
            </motion.div>
          ) : screen === "edit" && selectedAppointment ? (
            <motion.div
              key="edit"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="flex flex-col gap-4"
            >
              <MobileScreenHeader title="Reschedule appointment" onBack={goBack} />
              <RescheduleForm appointment={selectedAppointment} onCancel={goBack} onSaved={goBack} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(280px,360px)_1fr] gap-6">
      <div className="flex flex-col gap-4">
        <CalendarNavigator
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedDate={selectedDate}
          selectDate={selectDate}
          visibleDays={visibleDays}
          appointmentCountForDay={appointmentCountForDay}
          prefersReducedMotion={prefersReducedMotion}
          shiftSelectedDate={shiftSelectedDate}
          showDayOption={true}
        />

        <Separator />

        <AppointmentDayList
          selectedDate={selectedDate}
          appointmentsForSelectedDate={appointmentsForSelectedDate}
          selectedAppointmentId={selectedAppointmentId}
          onSelect={selectAppointment}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <AnimatePresence mode="wait" initial={false}>
          {selectedAppointment ? (
            <motion.div
              key={selectedAppointment.id}
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
              className="flex flex-col gap-4"
            >
              <AppointmentDetail appointment={selectedAppointment} />
              <Separator />
              {selectedAppointment.isPastDue ? (
                <AppointmentLifecycleActions
                  artistId={artistId}
                  bookingRequestId={selectedAppointment.id}
                />
              ) : (
                <AppointmentActions appointment={selectedAppointment} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
              className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center"
            >
              <p className="text-sm font-medium">No appointment selected</p>
              <p className="text-sm text-muted-foreground">
                Select an appointment from the calendar to see its details.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
