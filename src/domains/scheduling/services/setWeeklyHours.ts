import { prisma } from "@/lib/prisma";

import type { SetWeeklyHoursInput } from "../types";

// Write command (CLAUDE.md 4.3): see SetWeeklyHoursInput for the
// business rules this upsert implements.
export async function setWeeklyHours(input: SetWeeklyHoursInput): Promise<void> {
  await prisma.artistWeeklyHours.upsert({
    where: {
      artistId_dayOfWeek: {
        artistId: input.artistId,
        dayOfWeek: input.dayOfWeek,
      },
    },
    update: { availableTimes: input.availableTimes },
    create: {
      artistId: input.artistId,
      dayOfWeek: input.dayOfWeek,
      availableTimes: input.availableTimes,
    },
  });
}
