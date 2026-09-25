import { stripe } from "@/lib/stripe";

import { CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE } from "../constants";
import type { CreateConnectOnboardingLinkResult } from "../types";
import { createArtistConnectAccount } from "./createArtistConnectAccount";

// Domain Service (CLAUDE.md 24.1.2): starts or resumes Stripe's
// hosted Connect Express onboarding for an artist -- creates the
// underlying Connect account first if one doesn't exist yet
// (createArtistConnectAccount is itself idempotent), then requests a
// fresh, single-use Account Link. refresh_url is used by Stripe if the
// link expires or is revisited; both point back at the same settings
// page rather than a dedicated callback route, since getArtistConnectStatus
// re-reads live status on every load regardless of how the artist got
// there. NEXT_PUBLIC_APP_URL falls back to the local/CI dev server
// address (matching playwright.config.ts's baseURL) so this works
// without extra configuration outside production.
export async function createConnectOnboardingLink(
  artistId: string
): Promise<CreateConnectOnboardingLinkResult> {
  const account = await createArtistConnectAccount(artistId);
  if (!account.success) {
    return { success: false, error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settingsUrl = `${appUrl}/artist/${artistId}/settings/payouts`;

  try {
    const accountLink = await stripe.accountLinks.create({
      account: account.stripeConnectAccountId,
      type: "account_onboarding",
      refresh_url: settingsUrl,
      return_url: settingsUrl,
    });
    return { success: true, url: accountLink.url };
  } catch {
    return { success: false, error: CONNECT_ONBOARDING_LINK_INIT_ERROR_MESSAGE };
  }
}
