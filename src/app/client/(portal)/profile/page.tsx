import { notFound } from "next/navigation";

import { ThemePicker } from "@/components/ThemePicker";
import { BackNav } from "@/components/ui/back-nav";
import { Separator } from "@/components/ui/separator";
import { getCurrentSession } from "@/domains/auth/actions";
import { ClientProfileForm } from "@/domains/booking/components/ClientProfileForm";
import { getClientProfileContactDetails } from "@/domains/booking/services/getClientProfileContactDetails";

// View & Route (CLAUDE.md 10.1.4): session-derived like the rest of
// the client portal (5.2) -- no clientProfileId URL param, the
// route-protection proxy already guarantees a valid CLIENT session
// reached here. Reuses getClientProfileContactDetails (6.1.1) as-is
// for the read, same precedent as the booking form's prefill. The
// Appearance section (50.2.6.2) sits outside the form, so a theme
// choice never goes through the profile save.
export default async function ClientProfilePage() {
  const session = await getCurrentSession();
  const details = session?.clientProfileId
    ? await getClientProfileContactDetails(session.clientProfileId)
    : null;

  if (!details) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <BackNav href="/client" />
      <h1 className="text-lg font-semibold">Your profile</h1>
      <ClientProfileForm initialDetails={details} />
      <Separator />
      <ThemePicker />
    </div>
  );
}
