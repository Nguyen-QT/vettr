import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { PRECHARGE_PERCENTAGE } from "@/domains/billing/constants";
import { getArtistDepositSettings } from "@/domains/billing/services/getArtistDepositSettings";
import { BookingPolicies } from "@/domains/booking/components/BookingPolicies";
import { PortfolioGallery } from "@/domains/booking/components/PortfolioGallery";
import { ServiceMenu } from "@/domains/booking/components/ServiceMenu";
import {
  CANCELLATION_WINDOW_HOURS,
  STRIKE_THRESHOLD,
} from "@/domains/booking/constants";
import { buildServiceMenu } from "@/domains/booking/lib/buildServiceMenu";
import { getTierReferenceImages } from "@/domains/booking/services/getTierReferenceImages";
import { ArtistProfileHeader } from "@/domains/directory/components/ArtistProfileHeader";
import { getPublicArtistProfileByHandle } from "@/domains/directory/services/getPublicArtistProfileByHandle";
import { artistHandleSchema } from "@/lib/artistHandle";

interface ArtistProfilePageProps {
  params: Promise<{ handle: string }>;
}

interface UnavailableLogContext {
  reason: "PROFILE_LOOKUP_FAILED" | "PROFILE_SECTIONS_FAILED";
  artistId?: string;
}

// Logs a non-PII context (no handle, no raw driver error) and rethrows a
// generic error so no Prisma detail reaches the response.
function failUnavailable(context: UnavailableLogContext): () => never {
  return () => {
    console.error("renderArtistProfile failed", context);
    throw new Error("Artist profile unavailable");
  };
}

// No DB read here: the canonical URL only needs the parsed handle, so the
// page's lookup stays the single query per request. Invalid handles get
// no metadata -- the page 404s them (and Next adds noindex).
export async function generateMetadata({
  params,
}: ArtistProfilePageProps): Promise<Metadata> {
  const parsed = artistHandleSchema.safeParse((await params).handle);
  if (!parsed.success) {
    return {};
  }
  return {
    title: `@${parsed.data} | Vettr`,
    alternates: { canonical: `/@${parsed.data}` },
  };
}

// Public artist profile (54.1.6.1), served at `/@handle` via the
// next.config.ts rewrite. Composes read-only domain queries side by side
// (architecture.md §3) and stays presentational. No loading.tsx or
// Suspense sits above the lookup, so notFound() keeps a real 404 status.
export default async function ArtistProfilePage({
  params,
}: ArtistProfilePageProps) {
  const { handle: rawHandle } = await params;

  const parsed = artistHandleSchema.safeParse(rawHandle);
  if (!parsed.success) {
    notFound();
  }
  const handle = parsed.data;
  if (handle !== rawHandle) {
    // e.g. `/@Name` -> `/@name`. Regex-constrained target, idempotent
    // normaliser: no open redirect, no loop.
    permanentRedirect(`/@${handle}`);
  }

  // notFound() stays outside the catch handlers so its control-flow throw
  // is never swallowed; DB failures become a generic 500 (error.tsx).
  const profile = await getPublicArtistProfileByHandle(handle).catch(
    failUnavailable({ reason: "PROFILE_LOOKUP_FAILED" })
  );
  if (!profile) {
    notFound();
  }

  const [deposits, imagesByTier] = await Promise.all([
    getArtistDepositSettings(profile.id),
    getTierReferenceImages(profile.id),
  ]).catch(
    failUnavailable({ reason: "PROFILE_SECTIONS_FAILED", artistId: profile.id })
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <ArtistProfileHeader
        artist={{
          handle: profile.handle,
          name: profile.name,
          instagramHandle: profile.instagramHandle,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          location: profile.location,
        }}
      />
      <Separator />
      <ServiceMenu
        artistHandle={profile.handle}
        items={buildServiceMenu(deposits)}
      />
      <Separator />
      <PortfolioGallery imagesByTier={imagesByTier} />
      <Separator />
      <BookingPolicies
        cancellationWindowHours={CANCELLATION_WINDOW_HOURS}
        strikeThreshold={STRIKE_THRESHOLD}
        prechargePercentage={PRECHARGE_PERCENTAGE}
      />
    </main>
  );
}
