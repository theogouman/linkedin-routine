import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifySessionToken,
} from "@/modules/auth/lib/session";

/**
 * Porte d'entrée unique de l'app (FR-015).
 *
 * Tout est privé par défaut : on liste ce qui est public plutôt que ce qui est
 * protégé, pour qu'une route ajoutée demain soit fermée sans qu'on y pense.
 *
 * Les routes `/api/cron/*` ne passent pas par le cookie — elles sont appelées
 * par l'ordonnanceur, sans navigateur — et portent leur propre secret partagé
 * vérifié dans le handler.
 */

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js", "/offline"];
const PUBLIC_PREFIXES = ["/_next/", "/icons/", "/api/cron/", "/api/auth/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Sans secret configuré, on refuse tout plutôt que de laisser passer :
    // une variable oubliée au déploiement ne doit pas ouvrir l'app.
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, secret)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
