// Pure domain contracts for the directory bounded context (CLAUDE.md
// 5.3) -- public artist-browsing, a distinct concern from booking/
// vetting logic (intake) or slot scheduling (scheduling). Deliberately
// standalone TypeScript, same convention as the other domains.

// Read-shaped projection of an Artist for the public discovery
// directory. avatarUrl/bio/location are nullable at the DB level --
// a card simply omits whichever fields an artist hasn't set yet.
export interface ArtistDirectoryEntry {
  id: string;
  name: string;
  instagramHandle: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
}
