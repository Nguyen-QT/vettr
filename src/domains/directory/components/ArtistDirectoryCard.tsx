import Image from "next/image";
import Link from "next/link";

import type { ArtistDirectoryEntry } from "@/domains/directory/types";

interface ArtistDirectoryCardProps {
  artist: ArtistDirectoryEntry;
}

// Pure view (CLAUDE.md 5.3.3): read-only projection of an artist for
// the public discovery directory. Links straight into the existing
// /book/[artistId] hub -- the directory is just a way to find that
// page, not a page of its own the client interacts with.
export function ArtistDirectoryCard({ artist }: ArtistDirectoryCardProps) {
  return (
    <Link
      href={`/book/${artist.id}`}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex items-center gap-3">
        {artist.avatarUrl ? (
          <Image
            src={artist.avatarUrl}
            alt={artist.name}
            width={48}
            height={48}
            className="rounded-full object-cover"
          />
        ) : null}
        <div className="flex flex-col">
          <span className="text-sm font-medium">{artist.name}</span>
          <span className="text-sm text-muted-foreground">
            @{artist.instagramHandle}
          </span>
        </div>
      </div>

      {artist.location ? (
        <p className="text-sm text-muted-foreground">{artist.location}</p>
      ) : null}

      {artist.bio ? <p className="text-sm">{artist.bio}</p> : null}
    </Link>
  );
}
