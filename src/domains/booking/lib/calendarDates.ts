// Pure calendar grid date-math (CLAUDE.md 19.1.4/19.1.5), extracted out
// of ArtistCalendarView so the mobile branch can reuse it without
// duplicating it. No React, no JSX -- just Date arithmetic.

export function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + mondayOffset);
  return start;
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  return next;
}

// The 1st of the target month, not a day-count shift -- avoids
// Date.setMonth's day-overflow surprises (e.g. Jan 31 + 1 month
// silently landing in early March) and matches typical calendar UX
// where prev/next-month buttons move the displayed month itself, not
// a specific day.
export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

// The fixed 6-week (42-day) grid every month renders into, starting
// on the Monday on/before the 1st -- a constant cell count regardless
// of the month's length or starting weekday, so the grid never
// reflows between months.
export function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

// Local-date input value, same construction as AppointmentActions'
// toRequestedDateValue -- avoids a UTC-parsed round trip through the
// native <input type="date"> shifting the day in negative-UTC-offset
// timezones.
export function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
