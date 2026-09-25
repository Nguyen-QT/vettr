import { BackNav } from "@/components/ui/back-nav";
import { ArtistDirectoryCard } from "@/domains/directory/components/ArtistDirectoryCard";
import { getArtistDirectory } from "@/domains/directory/services/getArtistDirectory";

export default async function ArtistsDirectoryPage() {
  const artists = await getArtistDirectory();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
      <BackNav href="/" className="mb-3" />
      <h1 className="mb-3 text-lg font-semibold">Find an artist</h1>
      {artists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No artists are available to book right now.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {artists.map((artist) => (
            <ArtistDirectoryCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
    </main>
  );
}
