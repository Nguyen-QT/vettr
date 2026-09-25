import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// Domain Service (CLAUDE.md 24.1.2): creates a Stripe Connect Express
// account for an artist who doesn't have one yet -- idempotent by
// checking stripeConnectAccountId first rather than a Stripe-level
// idempotency key, since a second call from an artist who already has
// an account should just return that id, not attempt another create.
// External Side-Effect Safety: the Stripe call and the local persist
// write are separate try/catch blocks. If the call itself throws,
// nothing happened -- report failure. If it succeeds and the
// subsequent write fails, the Connect account already exists in Stripe
// regardless of whether this write lands, so reporting failure here
// would be factually wrong; log for visibility and still report
// success (mirrors refundDeposit's identical split, CLAUDE.md 7.3.3).
export async function createArtistConnectAccount(
  artistId: string
): Promise<{ success: true; stripeConnectAccountId: string } | { success: false }> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { stripeConnectAccountId: true, email: true },
  });

  if (!artist) {
    return { success: false };
  }

  if (artist.stripeConnectAccountId) {
    return { success: true, stripeConnectAccountId: artist.stripeConnectAccountId };
  }

  let account;
  try {
    account = await stripe.accounts.create({
      type: "express",
      email: artist.email,
    });
  } catch {
    return { success: false };
  }

  try {
    await prisma.artist.update({
      where: { id: artistId },
      data: { stripeConnectAccountId: account.id },
    });
  } catch (error) {
    console.error(
      `Failed to persist Stripe Connect account id for artist ${artistId} after Stripe account ${account.id} was created:`,
      error
    );
  }

  return { success: true, stripeConnectAccountId: account.id };
}
