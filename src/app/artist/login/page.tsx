import { Suspense } from "react";

import { BackNav } from "@/components/ui/back-nav";
import { LoginForm } from "@/domains/auth/components/LoginForm";

export default function ArtistLoginPage() {
  return (
    <main>
      <BackNav href="/" />
      <h1>Artist sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
