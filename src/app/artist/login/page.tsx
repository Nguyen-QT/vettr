import { Suspense } from "react";

import { LoginForm } from "@/domains/auth/components/LoginForm";

export default function ArtistLoginPage() {
  return (
    <main>
      <h1>Artist sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
