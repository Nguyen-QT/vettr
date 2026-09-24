import { prisma } from "@/lib/prisma";

import type { SetScheduleOverrideRangeInput } from "../types";

// Every date in [startDate, endDate] inclusive, parsed as local midnight,
// the same convention setScheduleOverride.ts uses for a single date. An
// endDate before startDate yields an empty array -- range ordering is
// validated at the schema layer (setScheduleOverrideRangeInputSchema),
// this stays a safe no-op rather than erroring if that's ever bypassed.
function enumerateDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

// Write command (CLAUDE.md 20.1): the same per-date upsert
// setScheduleOverride.ts performs, applied across every date in a
// continuous inclusive range in one transaction -- e.g. blocking out
// an extended break in one action instead of one date at a time.
export async function setScheduleOverrideRange(
  input: SetScheduleOverrideRangeInput
): Promise<void> {
  const dates = enumerateDates(input.startDate, input.endDate);

  await prisma.$transaction(
    dates.map((date) =>
      prisma.artistScheduleOverride.upsert({
        where: { artistId_date: { artistId: input.artistId, date } },
        update: { availableTimes: input.availableTimes },
        create: {
          artistId: input.artistId,
          date,
          availableTimes: input.availableTimes,
        },
      })
    )
  );
}
