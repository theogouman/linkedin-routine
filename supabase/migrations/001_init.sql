-- ════════════════════════════════════════════════════════════════════════════
-- 001 — Schéma initial : listes, comptes suivis, publications, commentaires
--       reçus, file d'écriture, curseurs de récupération, réglages, push.
--
-- Mono-utilisateur (FR-012) : aucune colonne user_id, aucune RLS. TOUT l'accès
-- se fait côté serveur avec la service role key ; le client n'a jamais de clé
-- Supabase. L'authentification de l'app est portée par le cookie de session
-- (FR-015), pas par Supabase Auth.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Listes (FR-001) ────────────────────────────────────────────────────────
create table if not exists lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Comptes suivis (FR-002) ────────────────────────────────────────────────
-- fetch_state : 'pending' tant qu'aucune récupération n'a abouti, 'ok' dès
-- qu'on a vu au moins une publication, 'restricted' quand le fournisseur
-- signale un profil non récupérable → marqueur visuel dans la liste.
create table if not exists accounts (
  id                 uuid primary key default gen_random_uuid(),
  profile_url        text not null unique,
  public_identifier  text,
  provider_id        text,
  name               text,
  headline           text,
  avatar_url         text,
  -- true pour le compte de l'utilisateur : ses posts portent les commentaires
  -- reçus (FR-008) mais n'apparaissent jamais dans le fil sortant (FR-004).
  is_self            boolean not null default false,
  fetch_state        text not null default 'pending'
                     check (fetch_state in ('pending', 'ok', 'restricted')),
  fetch_error        text,
  created_at         timestamptz not null default now()
);
create index if not exists accounts_fetch_state_idx on accounts (fetch_state);
create unique index if not exists accounts_public_identifier_idx
  on accounts (public_identifier) where public_identifier is not null;

create table if not exists list_accounts (
  list_id     uuid not null references lists (id) on delete cascade,
  account_id  uuid not null references accounts (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (list_id, account_id)
);
create index if not exists list_accounts_account_idx on list_accounts (account_id);

-- ── Publications (FR-003, FR-004, FR-010) ──────────────────────────────────
-- Conservation permanente : aucune purge, aucun TTL (FR-003).
create table if not exists posts (
  id                uuid primary key default gen_random_uuid(),
  provider_post_id  text not null unique,
  account_id        uuid references accounts (id) on delete set null,
  author_name       text,
  author_avatar_url text,
  author_profile_url text,
  body              text,
  media             jsonb not null default '[]'::jsonb,
  -- 'none' | 'image' | 'video' | 'document' | 'article' — 'video'/'document'
  -- ne sont pas restituables : l'UI affiche le lien LinkedIn à la place (FR-004).
  media_kind        text not null default 'none',
  is_repost         boolean not null default false,
  post_url          text,
  published_at      timestamptz not null,
  fetched_at        timestamptz not null default now(),
  is_own            boolean not null default false,
  liked_at          timestamptz,
  processed_at      timestamptz,
  processed_reason  text check (processed_reason in ('commented', 'ignored', 'liked'))
);
create index if not exists posts_feed_idx
  on posts (is_own, is_repost, published_at desc);
create index if not exists posts_unprocessed_idx
  on posts (processed_at, published_at desc) where processed_at is null;
create index if not exists posts_account_idx on posts (account_id, published_at desc);

-- ── Commentaires reçus (FR-008) ────────────────────────────────────────────
-- Imbrication illimitée via parent_comment_id ; depth stocké pour l'affichage.
create table if not exists received_comments (
  id                   uuid primary key default gen_random_uuid(),
  provider_comment_id  text not null unique,
  post_id              uuid not null references posts (id) on delete cascade,
  parent_comment_id    uuid references received_comments (id) on delete cascade,
  depth                integer not null default 0,
  author_name          text,
  author_profile_url   text,
  author_avatar_url    text,
  body                 text,
  comment_url          text,
  published_at         timestamptz not null,
  fetched_at           timestamptz not null default now(),
  liked_at             timestamptz,
  processed_at         timestamptz,
  processed_reason     text check (processed_reason in ('replied', 'ignored', 'liked'))
);
create index if not exists received_comments_post_idx
  on received_comments (post_id, published_at);
create index if not exists received_comments_unprocessed_idx
  on received_comments (processed_at, published_at desc) where processed_at is null;

-- ── File d'écriture + journal (FR-016, FR-017, FR-023) ─────────────────────
-- Une seule table pour la file ET le journal : un élément envoyé reste en
-- place avec status='sent'. Le journal est donc la vérité de ce qui est parti.
create table if not exists write_actions (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('comment', 'reply', 'like')),
  target_type        text not null check (target_type in ('post', 'comment')),
  target_post_id     uuid references posts (id) on delete cascade,
  target_comment_id  uuid references received_comments (id) on delete cascade,
  body               text,
  media              jsonb,
  origin             text not null default 'manual'
                     check (origin in ('manual', 'ai_edited', 'ai_unchanged')),
  status             text not null default 'pending'
                     check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_for      timestamptz not null,
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  attempts           integer not null default 0,
  error              text,
  provider_result    jsonb
);
create index if not exists write_actions_queue_idx
  on write_actions (status, scheduled_for) where status = 'pending';
create index if not exists write_actions_journal_idx
  on write_actions (created_at desc);
create index if not exists write_actions_target_post_idx on write_actions (target_post_id);
create index if not exists write_actions_target_comment_idx on write_actions (target_comment_id);
-- Un seul like en vol ou abouti par cible : empêche le doublon (FR-013).
create unique index if not exists write_actions_like_post_uniq
  on write_actions (target_post_id)
  where kind = 'like' and target_post_id is not null
    and status in ('pending', 'sending', 'sent');
create unique index if not exists write_actions_like_comment_uniq
  on write_actions (target_comment_id)
  where kind = 'like' and target_comment_id is not null
    and status in ('pending', 'sending', 'sent');

-- ── Curseurs de récupération (FR-003, FR-022) ──────────────────────────────
-- key : 'posts:<account_id>' | 'own_comments'. last_synced_at n'avance QUE sur
-- succès — un échec laisse le curseur en place pour ne rien manquer (FR-022).
create table if not exists sync_cursors (
  key              text primary key,
  last_synced_at   timestamptz,
  last_attempt_at  timestamptz,
  last_error       text,
  consecutive_failures integer not null default 0
);

-- ── État de la file / coupe-circuit (FR-017, FR-018) ───────────────────────
create table if not exists queue_state (
  id                 integer primary key default 1 check (id = 1),
  status             text not null default 'active' check (status in ('active', 'suspended')),
  suspended_at       timestamptz,
  suspended_reason   text,
  suspended_signal   text,
  resumed_at         timestamptz,
  -- Début du ramp-up : démarrage à 50 % des plafonds pendant 2 semaines puis
  -- +10-20 %/semaine (FR-017). Réinitialisé à 30 % après un coupe-circuit.
  ramp_started_on    date not null default current_date,
  ramp_override      numeric,
  ramp_override_on   date
);
insert into queue_state (id) values (1) on conflict (id) do nothing;

-- ── Réglages (plafonds, fenêtre, fréquence des vérifications) ──────────────
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ── Abonnements push (FR-014) ──────────────────────────────────────────────
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ── Journal des actualisations (FR-022) ────────────────────────────────────
create table if not exists sync_runs (
  id                uuid primary key default gen_random_uuid(),
  scope             text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  ok                boolean,
  accounts_synced   integer not null default 0,
  accounts_failed   integer not null default 0,
  posts_inserted    integer not null default 0,
  comments_inserted integer not null default 0,
  error             text
);
create index if not exists sync_runs_recent_idx on sync_runs (started_at desc);
