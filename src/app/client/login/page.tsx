import { Suspense } from "react";

import { BackNav } from "@/components/ui/back-nav";
import { ClientLoginForm } from "@/domains/auth/components/ClientLoginForm";

export default function ClientLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <BackNav href="/" />
      <h1>Sign in</h1>
      <Suspense>
        <ClientLoginForm />
      </Suspense>
    </main>
  );
}
