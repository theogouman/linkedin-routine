"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/modules/auth/server/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="nc-btn nc-btn--primary mt-4 w-full" disabled={pending}>
      {pending ? "Vérification…" : "Entrer"}
    </button>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/fil";
  const configError = params.get("error") === "config";

  const [state, formAction] = useActionState<LoginState, FormData>(login, {
    error: configError
      ? "SESSION_SECRET n'est pas configuré : l'app refuse toute connexion."
      : null,
  });

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className="sr-only">
        Mot de passe
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        placeholder="Mot de passe"
        className="nc-input"
      />
      {state.error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--color-brand)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
