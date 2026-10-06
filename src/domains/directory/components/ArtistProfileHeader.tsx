import { ExternalLinkIcon, MapPinIcon, UserRoundIcon } from "lucide-react";
import Image from "next/image";

import type { ArtistProfileHeaderProps } from "../types";

const AVATAR_SIZE_PX = 96;

const PILL_CLASS_NAME =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground";

// Pure view (54.1.4.1): renders the public `/@handle` profile header from
// the PublicArtistProfile DTO and makes no decisions of its own. Nullable
// fields (avatar, location, bio) are simply omitted. Section dividers are
// owned by the page (54.1.6.1).
export function ArtistProfileHeader({ artist }: ArtistProfileHeaderProps) {
  return (
    <header className="flex flex-col items-center gap-6 py-8 text-center">
      {artist.avatarUrl ? (
        <Image
          src={artist.avatarUrl}
          alt={artist.name}
          width={AVATAR_SIZE_PX}
          height={AVATAR_SIZE_PX}
          className="size-24 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex size-24 items-center justify-center rounded-full border border-border bg-muted">
          <UserRoundIcon
            aria-hidden="true"
            className="size-10 text-muted-foreground"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {artist.name}
        </h1>
        <p className="text-base text-muted-foreground">@{artist.handle}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {artist.location ? (
          <span className={PILL_CLASS_NAME}>
            <MapPinIcon aria-hidden="true" className="size-4" />
            {artist.location}
          </span>
        ) : null}
        <a
          href={`https://instagram.com/${artist.instagramHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${artist.name} on Instagram (opens in a new tab)`}
          className={PILL_CLASS_NAME}
        >
          Instagram
          <ExternalLinkIcon aria-hidden="true" className="size-4" />
        </a>
      </div>

      {artist.bio ? (
        <p className="max-w-prose whitespace-pre-line text-base leading-relaxed text-foreground">
          {artist.bio}
        </p>
      ) : null}
    </header>
  );
}
