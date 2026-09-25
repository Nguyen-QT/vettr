"use server";

import { getCurrentSession } from "@/domains/auth/actions";

import {
  addBillingAddonInputSchema,
  setArtistDepositSettingInputSchema,
} from "./billing.schema";
import { addBillingAddon } from "./services/addBillingAddon";
import { createConnectOnboardingLink } from "./services/createConnectOnboardingLink";
import { createDepositPaymentIntent } from "./services/createDepositPaymentIntent";
import { finalizeCheckout } from "./services/finalizeCheckout";
import { getArtistConnectStatus } from "./services/getArtistConnectStatus";
import { getArtistDepositSettings } from "./services/getArtistDepositSettings";
import { removeBillingAddon } from "./services/removeBillingAddon";
import { setArtistDepositSettings } from "./services/setArtistDepositSettings";
import type {
  AddBillingAddonResult,
  ArtistConnectStatus,
  ArtistDepositSettings,
  CreateConnectOnboardingLinkResult,
  CreateDepositPaymentIntentResult,
  FinalizeCheckoutResult,
  RemoveBillingAddonResult,
} from "./types";

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

// Controller/Action boundary (CLAUDE.md 7.5.5): validates structurally,
// derives artistId from the trusted session -- addBillingAddon itself
// re-checks ownership against bookingRequestId, this layer just
// supplies a trustworthy id, same posture as
// setArtistDepositSettingsAction above.
export async function addBillingAddonAction(
  bookingRequestId: string,
  input: unknown
): Promise<AddBillingAddonResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const parsed = addBillingAddonInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid addon.",
    };
  }

  return addBillingAddon({ bookingRequestId, artistId, ...parsed.data });
}

// Controller/Action boundary (CLAUDE.md 7.5.5): derives artistId from
// the trusted session -- removeBillingAddon itself re-checks ownership
// by resolving the addon back to its owning request.
export async function removeBillingAddonAction(
  addonId: string
): Promise<RemoveBillingAddonResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  return removeBillingAddon({ addonId, artistId });
}

// Controller/Action boundary (CLAUDE.md 7.5.5): derives artistId from
// the trusted session -- finalizeCheckout itself re-checks ownership,
// then delegates the APPROVED/past-due business rules to booking's
// markAppointmentCompleted.
export async function finalizeCheckoutAction(
  bookingRequestId: string
): Promise<FinalizeCheckoutResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  return finalizeCheckout(bookingRequestId, artistId);
}

// Controller/Action boundary (CLAUDE.md 24.1.3): fully session-derived,
// no id param -- an artist is always starting/resuming their own
// Connect onboarding, same posture as getArtistDepositSettingsAction
// above.
export async function createConnectOnboardingLinkAction(): Promise<CreateConnectOnboardingLinkResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  return createConnectOnboardingLink(artistId);
}

export type GetArtistConnectStatusResult =
  | { success: true; status: ArtistConnectStatus }
  | { success: false; error: string };

// Controller/Action boundary (CLAUDE.md 24.1.3): fully session-derived,
// no id param -- an artist is always reading their own Connect status,
// same posture as getArtistDepositSettingsAction above.
export async function getArtistConnectStatusAction(): Promise<GetArtistConnectStatusResult> {
  const artistId = await requireArtistId();
  if (!artistId) {
    return { success: false, error: NOT_SIGNED_IN_AS_ARTIST_ERROR_MESSAGE };
  }

  const status = await getArtistConnectStatus(artistId);
  return { success: true, status };
}
