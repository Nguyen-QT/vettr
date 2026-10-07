import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { BackNav } from "@/components/ui/back-nav";
import { getCurrentSession } from "@/domains/auth/actions";
import { complexityTierSchema } from "@/domains/booking/booking.schema";
import { BookingProcessExplainer } from "@/domains/booking/components/BookingProcessExplainer";
import { VisualBookingForm } from "@/domains/booking/components/VisualBookingForm";
import { getClientProfileContactDetails } from "@/domains/booking/services/getClientProfileContactDetails";
import { getTierReferenceImages } from "@/domains/booking/services/getTierReferenceImages";
import type { ClientProfileContactDetails } from "@/domains/booking/types";
import { getPublicArtistProfileByHandle } from "@/domains/directory/services/getPublicArtistProfileByHandle";
import { artistHandleSchema } from "@/lib/artistHandle";

interface ArtistBookPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ service?: string | string[] }>;
}

interface UnavailableLogContext {
  reason: "PROFILE_LOOKUP_FAILED" | "BOOKING_SECTIONS_FAILED";
  artistId?: string;
}

// Logs a non-PII context (no handle, no raw driver error) and rethrows a
// generic error so no Prisma detail reaches the response.
function failUnavailable(context: UnavailableLogContext): () => never {
  return () => {
    console.error("renderArtistBookPage failed", context);
    throw new Error("Booking page unavailable");
  };
}

// Prefill keys on activeRole, matching requireClientProfileId in
// booking/actions.ts: a dual-role account in client view is prefilled, an
// artist-view session is treated as a guest.
async function getActiveClientDetails(): Promise<ClientProfileContactDetails | null> {
  const session = await getCurrentSession();
  return session?.activeRole === "CLIENT" && session.clientProfileId
    ? getClientProfileContactDetails(session.clientProfileId)
    : null;
}

export async function generateMetadata({
  params,
}: ArtistBookPageProps): Promise<Metadata> {
  const parsed = artistHandleSchema.safeParse((await params).handle);
  if (!parsed.success) {
    return {};
  }
  return {
    title: `Book @${parsed.data} | Vettr`,
    alternates: { canonical: `/@${parsed.data}/book` },
  };
}

// Booking intake at `/@handle/book` (54.1.6.2), served via the
// next.config.ts rewrite. Mounts the existing wizard; `?service=` (the
// profile's service menu links) preselects the tier, and anything
// missing or unrecognised falls back to the wizard's default. No
// loading.tsx or Suspense sits above the lookup, so notFound() and the
// 308 keep their real statuses.
export default async function ArtistBookPage({
  params,
  searchParams,
}: ArtistBookPageProps) {
  const [{ handle: rawHandle }, { service }] = await Promise.all([
    params,
    searchParams,
  ]);

  const parsedHandle = artistHandleSchema.safeParse(rawHandle);
  if (!parsedHandle.success) {
    notFound();
  }
  const handle = parsedHandle.data;

  const parsedTier = complexityTierSchema.safeParse(service);
  const initialTier = parsedTier.success ? parsedTier.data : undefined;

  if (handle !== rawHandle) {
    // Only the enum-validated tier is carried over -- never the raw query.
    permanentRedirect(
      `/@${handle}/book${initialTier ? `?service=${initialTier}` : ""}`
    );
  }

  // notFound() stays outside the catch handlers so its control-flow throw
  // is never swallowed; DB failures become a generic 500 (error.tsx).
  const profile = await getPublicArtistProfileByHandle(handle).catch(
    failUnavailable({ reason: "PROFILE_LOOKUP_FAILED" })
  );
  if (!profile) {
    notFound();
  }

  const [tierReferenceImages, initialClientDetails] = await Promise.all([
    getTierReferenceImages(profile.id),
    getActiveClientDetails(),
  ]).catch(
    failUnavailable({ reason: "BOOKING_SECTIONS_FAILED", artistId: profile.id })
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <BackNav href={`/@${profile.handle}`} />
      <div className="flex flex-col gap-2 py-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Request a booking
        </h1>
        <p className="text-base text-muted-foreground">
          with {profile.name} (@{profile.handle})
        </p>
      </div>
      <BookingProcessExplainer />
      <VisualBookingForm
        artistId={profile.id}
        tierReferenceImages={tierReferenceImages}
        initialClientDetails={initialClientDetails ?? undefined}
        initialTier={initialTier}
      />
    </main>
  );
}
