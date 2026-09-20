"use server";

import { prisma } from "@/lib/prisma";

import { clientIntakeInputSchema } from "./intake.schema";
import { validateComplexity } from "./services/validateComplexity";

export type SubmitIntakeRequestResult =
  | { success: true; intakeRequestId: string }
  | { success: false; error: string };

// No Auto-Booking (CLAUDE.md): this only ever creates PENDING rows with
// no allocated TimeSlots. Slot requesting/approval is scheduling-domain
// territory, out of scope here.
export async function submitIntakeRequest(
  artistId: string,
  input: unknown
): Promise<SubmitIntakeRequestResult> {
  const parsed = clientIntakeInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid intake request.",
    };
  }

  const data = parsed.data;

  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) {
    return { success: false, error: "This booking page could not be found." };
  }

  const complexityCheck = validateComplexity({
    tier: data.tier,
    clientNotes: data.clientNotes,
    designTags: data.designTags,
    aestheticTags: data.aestheticTags,
  });

  if (!complexityCheck.success) {
    return { success: false, error: complexityCheck.error };
  }

  const client = await prisma.clientProfile.upsert({
    where: { instagramHandle: data.instagramHandle },
    update: {
      email: data.email,
      phone: data.phone,
    },
    create: {
      instagramHandle: data.instagramHandle,
      email: data.email,
      phone: data.phone,
    },
  });

  const intakeRequest = await prisma.intakeRequest.create({
    data: {
      clientId: client.id,
      artistId: artist.id,
      tier: data.tier,
      minPrice: data.clientBudgetRange.minPrice,
      maxPrice: data.clientBudgetRange.maxPrice,
      designTags: data.designTags ?? [],
      aestheticTags: data.aestheticTags ?? [],
      clientNotes: data.clientNotes,
      designReferences: {
        create: data.designReferenceImageUrls.map((imageUrl) => ({
          imageUrl,
        })),
      },
    },
  });

  return { success: true, intakeRequestId: intakeRequest.id };
}
