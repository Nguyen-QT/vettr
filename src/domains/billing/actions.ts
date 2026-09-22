"use server";

import { getCurrentSession } from "@/domains/auth/actions";

import { setArtistDepositSettingInputSchema } from "./billing.schema";
import { createDepositPaymentIntent } from "./services/createDepositPaymentIntent";
import { getArtistDepositSettings } from "./services/getArtistDepositSettings";
import { setArtistDepositSettings } from "./services/setArtistDepositSettings";
import type { ArtistDepositSettings, CreateDepositPaymentIntentResult } from "./types";

const NOT_SIGNED_IN_ERROR_MESSAGE = "You must be signed in as a client to do that.";
const NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE =
  "You must be signed in as an artist to do that.";

async function requireClientProfileId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "CLIENT" || !session.clientProfileId) {
    return null;
  }
  return session.clientProfileId;
}

async function requireArtistId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ARTIST" || !session.artistId) {
    return null;
  }
  return session.artistId;
}

// Controller/Action boundary (CLAUDE.md 7.1.5): derives clientProfileId
// from the trusted session -- createDepositPaymentIntent itself
// re-checks ownership, this layer just supplies a trustworthy id, same
// posture as booking's cancelBookingRequestAction (5.4.2).
export async function createDepositPaymentIntentAction(
  bookingRequestId: string
): Promise<CreateDepositPaymentIntentResult> {
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { success: false, error: NOT_SIGNED_IN_ERROR_MESSAGE };
  }

  return createDepositPaymentIntent({ bookingRequestId, clientProfileId });
}

export type DepositSettingsMutationResult =
  | { success: true }
  | { success: false; error: string };

// Controller/Action boundary (CLAUDE.md 7.1.5): validates structurally,
// derives artistId from the trusted session (ignoring any
// client-supplied artistId) so an artist can only ever set their own
// deposit amounts, then hands off to the upsert.
export async function setArtistDepositSettingsAction(
  input: unknown
): Promise<DepositSettingsMutationResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = setArtistDepositSettingInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid deposit amount.",
    };
  }

  await setArtistDepositSettings({ artistId, ...parsed.data });
  return { success: true };
}

export type GetArtistDepositSettingsResult =
  | { success: true; settings: ArtistDepositSettings }
  | { success: false; error: string };

// Controller/Action boundary (CLAUDE.md 7.1.5): fully session-derived,
// no id param -- an artist is always reading their own settings, same
// posture as booking's getClientBookings precedent. Powers the artist
// settings UI (7.1.8).
export async function getArtistDepositSettingsAction(): Promise<GetArtistDepositSettingsResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const settings = await getArtistDepositSettings(artistId);
  return { success: true, settings };
}
