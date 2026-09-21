import { prisma } from "@/lib/prisma";

import { DAILY_SLOT_TIME_OPTIONS } from "../constants";
import type { SlotTime } from "../types";

// Read query (CLAUDE.md 4.3): resolves which of the artist's fixed
// daily times are open for a given date, before any booking-based
// filtering (see getAvailableSlots, which composes this with existing
// bookings). Override-first, then the day-of-week's weekly-hours row,
// else default-open -- an artist with no configured hours at all must
// not silently have every day closed.
export async function getOperatingWindows(
  artistId: string,
  date: string
): Promise<SlotTime[]> {
  const dayDate = new Date(`${date}T00:00:00`);

  const override = await prisma.artistScheduleOverride.findUnique({
    where: { artistId_date: { artistId, date: dayDate } },
  });

  if (override) {
    return override.availableTimes as SlotTime[];
  }

  const dayOfWeek = dayDate.getDay();

  const weeklyHours = await prisma.artistWeeklyHours.findUnique({
    where: { artistId_dayOfWeek: { artistId, dayOfWeek } },
  });

  if (weeklyHours) {
    return weeklyHours.availableTimes as SlotTime[];
  }

  return [...DAILY_SLOT_TIME_OPTIONS];
}
