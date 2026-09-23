import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession } from "@/domains/auth/actions";
import { ClientProfileForm } from "@/domains/booking/components/ClientProfileForm";
import { getClientProfileContactDetails } from "@/domains/booking/services/getClientProfileContactDetails";

// View & Route (CLAUDE.md 10.1.4): session-derived like the rest of
// the client portal (5.2) -- no clientProfileId URL param, the
// route-protection proxy already guarantees a valid CLIENT session
// reached here. Reuses getClientProfileContactDetails (6.1.1) as-is
// for the read, same precedent as the booking form's prefill.
export default async function ClientProfilePage() {
  const session = await getCurrentSession();
  const details = session?.clientProfileId
    ? await getClientProfileContactDetails(session.clientProfileId)
    : null;

  if (!details) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <Link href="/client" className={buttonVariants({ variant: "outline" })}>
        Back
      </Link>
      <h1 className="text-lg font-semibold">Your profile</h1>
      <ClientProfileForm initialDetails={details} />
    </div>
  );
}
