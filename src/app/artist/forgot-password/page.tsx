import { BackNav } from "@/components/ui/back-nav";
import { ArtistForgotPasswordContainer } from "@/domains/auth/components/ArtistForgotPasswordContainer";
import { ARTIST_LOGIN_PATH } from "@/domains/auth/constants";

export default function ArtistForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <BackNav href={ARTIST_LOGIN_PATH} />
      <h1>Reset your password</h1>
      <ArtistForgotPasswordContainer />
    </main>
  );
}
