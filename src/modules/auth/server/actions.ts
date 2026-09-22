"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readEnv, requireEnv } from "@/shared/lib/env";
import { verifyPassword } from "../lib/password";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../lib/session";

export interface LoginState {
  error: string | null;
}

/**
 * Connexion (FR-015).
 *
 * Un délai plancher volontaire sur l'échec : sans lui, la durée de la réponse
 * distingue « mot de passe faux » de « hash non configuré », et transforme le
 * formulaire en oracle.
 */
export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const started = Date.now();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/fil");

  const stored = readEnv("APP_PASSWORD_HASH");
  const secret = readEnv("SESSION_SECRET");

  const ok =
    stored !== undefined &&
    secret !== undefined &&
    (await verifyPassword(password, stored));

  if (!ok) {
    const elapsed = Date.now() - started;
    if (elapsed < 400) {
      await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
    }
    return {
      error:
        stored === undefined || secret === undefined
          ? "Configuration incomplète : APP_PASSWORD_HASH ou SESSION_SECRET manquant."
          : "Mot de passe incorrect.",
    };
  }

  const token = await createSessionToken(requireEnv("SESSION_SECRET"));
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(next.startsWith("/") ? next : "/fil");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
