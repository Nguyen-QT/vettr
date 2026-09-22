import { prisma } from "@/lib/prisma";

import { DAILY_SLOT_TIME_OPTIONS, MAX_SLOT_DURATION_MINUTES } from "../constants";
import type { SlotTime } from "../types";
import { getOperatingWindows } from "./getOperatingWindows";

export interface AvailableSlot {
  time: SlotTime;
  available: boolean;
}

function slotWindow(date: string, time: SlotTime): { start: Date; end: Date } {
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + MAX_SLOT_DURATION_MINUTES * 60_000);
  return { start, end };
}

function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Read query (CLAUDE.md 4.1j/4.3): a fixed daily time is available if
// it's within the artist's operating windows for that date (CLAUDE.md
// 4.3's getOperatingWindows -- business hours/blackouts/overrides) AND
// no already-BOOKED TimeSlot for this artist overlaps its nominal
// [time, time + MAX_SLOT_DURATION_MINUTES) window. Duration isn't known
// yet at booking time -- this is the same nominal per-slot length
// confirmTimeSlot itself books for a single-slot request, so a time is
// only ever marked available if a normal one-slot booking there would
// actually succeed.
export async function getAvailableSlots(
  artistId: string,
  date: string
): Promise<AvailableSlot[]> {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const [operatingWindows, bookedSlots] = await Promise.all([
    getOperatingWindows(artistId, date),
    prisma.timeSlot.findMany({
      where: {
        artistId,
        status: "BOOKED",
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  return DAILY_SLOT_TIME_OPTIONS.map((time) => {
    if (!operatingWindows.includes(time)) {
      return { time, available: false };
    }

    const window = slotWindow(date, time);
    const available = !bookedSlots.some((slot) =>
      rangesOverlap(window.start, window.end, slot.startTime, slot.endTime)
    );
    return { time, available };
  });
}
