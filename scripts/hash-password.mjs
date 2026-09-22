#!/usr/bin/env node
/**
 * Génère la valeur de APP_PASSWORD_HASH.
 *
 *   node scripts/hash-password.mjs "mon mot de passe"
 *
 * Le mot de passe en clair n'est jamais écrit sur disque ni en base : seule la
 * ligne produite ici est à coller dans les variables d'environnement.
 */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ITERATIONS = 310_000;
const password = process.argv[2];

if (!password) {
  console.error('Usage : node scripts/hash-password.mjs "mon mot de passe"');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  key,
  256,
);

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
console.log(`APP_PASSWORD_HASH=pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`);
