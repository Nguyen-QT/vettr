import { prisma } from "@/lib/prisma";

import type { SetScheduleOverrideInput } from "../types";

// Write command (CLAUDE.md 4.3): see SetScheduleOverrideInput for the
// business rules this upsert implements.
export async function setScheduleOverride(
  input: SetScheduleOverrideInput
): Promise<void> {
  const date = new Date(`${input.date}T00:00:00`);

  await prisma.artistScheduleOverride.upsert({
    where: { artistId_date: { artistId: input.artistId, date } },
    update: { availableTimes: input.availableTimes },
    create: {
      artistId: input.artistId,
      date,
      availableTimes: input.availableTimes,
    },
  });
}
