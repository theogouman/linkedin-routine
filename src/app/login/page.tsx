import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion — Routine" };

export default function LoginPage() {
  return (
    <main className="nc-page flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="nc-card nc-content-enter w-full max-w-sm p-7">
        <h1 className="text-xl font-semibold tracking-tight">Routine</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Fil curé et inbox d&apos;engagement.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
