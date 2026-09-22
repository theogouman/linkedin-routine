#!/usr/bin/env node
/**
 * Génère d'un coup toutes les variables que l'app peut produire elle-même :
 * les deux secrets aléatoires, la paire VAPID et le condensat du mot de passe.
 *
 *   node scripts/generate-secrets.mjs "mon mot de passe"
 *
 * Les autres variables (Supabase, Apify, Unipile, Anthropic) viennent de
 * comptes tiers et sont listées à la fin avec l'endroit exact où les prendre.
 *
 * Rien n'est écrit sur disque : la sortie est à coller dans `.env.local` ou
 * dans les variables d'environnement Vercel. Le mot de passe en clair n'est
 * jamais stocké, seul son condensat PBKDF2 l'est.
 */
import { randomBytes, webcrypto } from "node:crypto";
import webpush from "web-push";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ITERATIONS = 310_000;
const password = process.argv[2];

if (!password) {
  console.error('Usage : node scripts/generate-secrets.mjs "mon mot de passe"\n');
  console.error("Le mot de passe est celui qui ouvrira l'app. Choisis-le long :");
  console.error("c'est la seule barrière devant ton compte LinkedIn connecté.");
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `⚠️  ${password.length} caractères seulement. Vise au moins 12 : ce mot de passe\n` +
      "   protège une app qui peut publier au nom de ton compte LinkedIn.\n",
  );
}

// ── Condensat du mot de passe (PBKDF2-SHA256, sel aléatoire) ────────────────
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
const passwordHash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

// ── Secrets aléatoires ──────────────────────────────────────────────────────
const sessionSecret = randomBytes(32).toString("base64");
const cronSecret = randomBytes(32).toString("base64url");

// ── Paire VAPID pour les notifications push ─────────────────────────────────
const vapid = webpush.generateVAPIDKeys();

console.log(`
# ══════════════════════════════════════════════════════════════════════════
# Généré le ${new Date().toISOString()}
# À coller dans .env.local (dev) ou dans les variables Vercel (prod).
# Ne commite JAMAIS ce bloc.
# ══════════════════════════════════════════════════════════════════════════

APP_PASSWORD_HASH=${passwordHash}
SESSION_SECRET=${sessionSecret}
CRON_SECRET=${cronSecret}

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:CHANGE-MOI@exemple.fr

# ── À récupérer sur les comptes tiers ──────────────────────────────────────
# Supabase  → Project Settings ▸ Data API (URL) et ▸ API Keys (service_role)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Apify     → Settings ▸ API & Integrations ▸ Personal API tokens
APIFY_TOKEN=
# Unipile   → Dashboard : DSN de ton instance, clé d'API, id du compte connecté
UNIPILE_DSN=
UNIPILE_API_KEY=
UNIPILE_ACCOUNT_ID=
# Anthropic → console.anthropic.com ▸ API keys (clé DÉDIÉE à cette app)
ANTHROPIC_API_KEY=
`);

console.error("✓ 4 valeurs générées. Les 8 restantes viennent des comptes tiers.");
console.error("  Détail pas à pas : docs/VARIABLES-ENV.md");
