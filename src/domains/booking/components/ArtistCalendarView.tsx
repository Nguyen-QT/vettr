"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import { AppointmentActions } from "@/domains/booking/components/AppointmentActions";
import { AppointmentDetail } from "@/domains/booking/components/AppointmentDetail";
import { AppointmentLifecycleActions } from "@/domains/booking/components/AppointmentLifecycleActions";
import {
  isSameCalendarDay,
  useAppointmentCalendar,
} from "@/domains/booking/hooks/useAppointmentCalendar";
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

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  return start;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  return next;
}

// The 1st of the target month, not a day-count shift -- avoids
// Date.setMonth's day-overflow surprises (e.g. Jan 31 + 1 month
// silently landing in early March) and matches typical calendar UX
// where prev/next-month buttons move the displayed month itself, not
// a specific day.
function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

// The fixed 6-week (42-day) grid every month renders into, starting
// on the Monday on/before the 1st -- a constant cell count regardless
// of the month's length or starting weekday, so the grid never
// reflows between months.
function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

// Local-date input value, same construction as AppointmentActions'
// toRequestedDateValue -- avoids a UTC-parsed round trip through the
// native <input type="date"> shifting the day in negative-UTC-offset
// timezones.
function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// View (CLAUDE.md 19.1.4): the desktop (>=1024px) master-detail
// calendar -- an interactive week/day grid on the left, a persistent
// detail panel on the right rendering AppointmentDetail (19.1.2) plus
// the same per-item action controls the existing appointments list
// already uses (AppointmentActions/AppointmentLifecycleActions,
// picked by isPastDue) rather than a bespoke edit form -- those
// already provide the "explicit Edit control switches into an inline
// form" behavior for an upcoming appointment's Reschedule button, with
// their own Phase 9 confirm dialogs intact. useAppointmentCalendar's
// isEditing/startEditing/stopEditing/screen/goBack are deliberately
// unused here -- they exist for 19.1.5's mobile slide-in stack, which
// the desktop persistent panel has no equivalent of.
//
// isDesktop !== true (still hydrating, or genuinely a narrow viewport
// since 19.1.5 hasn't shipped the mobile branch yet) renders a neutral
// placeholder instead of guessing at the desktop layout.
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
  } = useAppointmentCalendar(appointments);

  const prefersReducedMotion = useReducedMotion();

  if (isDesktop !== true) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <p className="text-sm font-medium">
          {isDesktop === null ? "Loading calendar…" : "The calendar view is desktop-only for now"}
        </p>
        {isDesktop === false ? (
          <>
            <p className="text-sm text-muted-foreground">
              A mobile agenda is coming soon -- use the appointments list for now.
            </p>
            <Link
              href={`/artist/${artistId}/appointments`}
              className="text-sm underline underline-offset-4"
            >
              Go to appointments
            </Link>
          </>
        ) : null}
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

  return (
    <div className="grid grid-cols-[minmax(280px,360px)_1fr] gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
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
            <Button
              type="button"
              variant={viewMode === "day" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              Day
            </Button>
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

        <Separator />

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{DAY_HEADING_FORMAT.format(selectedDate)}</h2>
          {appointmentsForSelectedDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments on this day.</p>
          ) : (
            appointmentsForSelectedDate.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => selectAppointment(appointment.id)}
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
                <span className="text-muted-foreground">
                  @{appointment.clientInstagramHandle}
                </span>
              </button>
            ))
          )}
        </div>
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
