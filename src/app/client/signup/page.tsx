import { BackNav } from "@/components/ui/back-nav";
import { ClientSignupForm } from "@/domains/auth/components/ClientSignupForm";

export default function ClientSignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-4">
      <BackNav href="/" />
      <h1>Create your account</h1>
      <ClientSignupForm />
    </main>
  );
}
