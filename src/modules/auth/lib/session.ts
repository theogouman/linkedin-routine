/**
 * Jeton de session (FR-015).
 *
 * JWT signé HS256 avec `jose`, compatible avec le runtime Edge du middleware.
 * Durée longue (30 jours) et renouvellement à chaque passage : l'app doit
 * rester ouverte entre les sessions sur le téléphone (FR-011), redemander le
 * mot de passe chaque matin tuerait la routine.
 */

import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "lr_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ISSUER = "linkedin-routine";
const SUBJECT = "owner";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(SUBJECT)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE_SECONDS)
    .sign(secretKey(secret));
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey(secret), {
      issuer: ISSUER,
      subject: SUBJECT,
    });
    return true;
  } catch {
    return false;
  }
}
