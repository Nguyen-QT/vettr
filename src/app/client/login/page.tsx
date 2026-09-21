import { Suspense } from "react";

import { ClientLoginForm } from "@/domains/auth/components/ClientLoginForm";

export default function ClientLoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <Suspense>
        <ClientLoginForm />
      </Suspense>
    </main>
  );
}
