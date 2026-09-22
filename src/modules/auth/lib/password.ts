/**
 * Vérification du mot de passe unique (FR-015).
 *
 * PBKDF2 via Web Crypto plutôt qu'une dépendance native : le même code tourne
 * dans le runtime Node et dans le runtime Edge du middleware, sans binaire à
 * compiler. Un seul utilisateur, un seul secret — pas d'inscription, pas de
 * réinitialisation, pas de rôles : toute cette machinerie serait du code à
 * maintenir et à sécuriser pour un compte unique.
 *
 * Format du condensat : `pbkdf2$<itérations>$<sel base64>$<clé base64>`.
 */

const KEY_LENGTH_BITS = 256;
export const DEFAULT_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Comparaison à temps constant : pas de fuite par la durée de l'échec. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = fromBase64(parts[2] ?? "");
    const expected = fromBase64(parts[3] ?? "");
    const derived = await derive(password, salt, iterations);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
