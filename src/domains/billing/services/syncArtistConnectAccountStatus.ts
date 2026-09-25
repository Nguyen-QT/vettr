import { prisma } from "@/lib/prisma";

// Domain Service (CLAUDE.md 24.1.2): called from the Stripe webhook's
// account.updated case to keep stripeConnectChargesEnabled/
// stripeConnectPayoutsEnabled in sync with Stripe's own view --
// the reconciliation backstop for createArtistConnectAccount, the
// same role payment_intent.succeeded plays for confirmDepositPayment.
// Unlike that one-directional boolean, these two flags can legitimately
// flip in either direction (e.g. Stripe pausing payouts for a risk
// review), so this always overwrites with the latest values rather
// than short-circuiting once already true -- safe to re-run on a
// redelivered event either way, since it's just setting the same
// values again.
export async function syncArtistConnectAccountStatus(
  stripeAccountId: string,
  chargesEnabled: boolean,
  payoutsEnabled: boolean
): Promise<void> {
  await prisma.artist.updateMany({
    where: { stripeConnectAccountId: stripeAccountId },
    data: {
      stripeConnectChargesEnabled: chargesEnabled,
      stripeConnectPayoutsEnabled: payoutsEnabled,
    },
  });
}
