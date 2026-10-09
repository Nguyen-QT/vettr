// Pure domain contracts for the directory bounded context (CLAUDE.md
// 5.3) -- public artist-browsing, a distinct concern from booking/
// vetting logic (booking) or slot scheduling (scheduling). Deliberately
// standalone TypeScript, same convention as the other domains.

// Public `/@handle` read model (54.1). Deliberately no email or Stripe
// fields. `id` is included so the page can compose the billing/booking
// reads for the same artist.
export interface PublicArtistProfile {
  id: string;
  handle: string;
  name: string;
  instagramHandle: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
}

// Pure view props (54.1.4.1). Omits `id`: the header never needs it, and
// the page can pass the PublicArtistProfile DTO straight through.
export interface ArtistProfileHeaderProps {
  artist: Omit<PublicArtistProfile, "id">;
}

// Pure view props (54.4.4.1). State, validation and navigation are wired
// in by useFindArtist (54.4.5.1).
export interface FindArtistFormProps {
  handle: string;
  onHandleChange: (value: string) => void;
  onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  isNavigating?: boolean;
  error?: string;
}
