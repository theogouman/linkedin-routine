-- ════════════════════════════════════════════════════════════════════════════
-- 009 — Générateur de commentaires : corpus d'exemples et journal de feedback.
--
-- Deux tables aux rôles opposés.
--
-- `comment_examples` est la MÉMOIRE DE STYLE. Elle contient les vrais
-- commentaires de Théo. Elle n'est jamais envoyée en entier au modèle : cinq
-- lignes en sont tirées à chaque génération. C'est ce qui garde le prompt
-- court et le coût stable quand le corpus grossit.
--
-- `comment_generations` est le JOURNAL. Une ligne par génération, avec ce qui
-- est sorti, ce qui a été retenu et ce qui a été publié. Sans lui, il n'y a
-- aucun moyen de savoir si le générateur s'améliore : les seuls signaux qui
-- comptent — taux de publication, taux de publication sans retouche, distance
-- d'édition — ne se lisent nulle part ailleurs.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists vector with schema extensions;

-- ── Corpus ─────────────────────────────────────────────────────────────────
create table if not exists comment_examples (
  id            bigint generated always as identity primary key,
  date          timestamptz not null,
  lien          text,
  -- Sépare les deux corpus : commentaires laissés chez les autres d'un côté,
  -- réponses sous ses propres posts de l'autre. Ce ne sont pas les mêmes
  -- registres, et une réponse ne doit jamais servir d'exemple pour un
  -- commentaire.
  sur_mon_post  boolean not null,
  categorie     text not null check (categorie in (
    'question', 'reaction_courte', 'avis_court', 'experience_perso',
    'avis_nuance', 'accord_plus_ajout', 'felicitation_appreciation',
    'humour', 'expertise_structuree',
    'reponse_accord_court', 'reponse_remerciement', 'reponse_argumentee',
    'reponse_lead_magnet'
  )),
  mots          integer not null,
  texte         text not null,
  -- 384 dimensions = `gte-small`, le modèle d'embedding intégré aux Edge
  -- Functions Supabase. Choisi parce qu'il n'ajoute ni fournisseur, ni clé,
  -- ni facture : Anthropic ne produit pas d'embeddings.
  --
  -- Nullable À DESSEIN : la sélection thématique dégrade proprement vers un
  -- tirage aléatoire quand l'embedding manque. Le générateur marche donc dès
  -- l'import, avant que les embeddings soient calculés.
  embedding     extensions.vector(384),
  -- Provenance : `corpus` pour l'import initial, `publie` pour un commentaire
  -- réinjecté après retouche (cf. le journal plus bas). Les distinguer permet
  -- de mesurer la dérive si la réinjection tournait mal.
  source        text not null default 'corpus' check (source in ('corpus', 'publie')),
  created_at    timestamptz not null default now(),
  -- Rend l'import rejouable : deux passages du même fichier n'ajoutent rien.
  unique (date, texte)
);

-- La sélection filtre TOUJOURS sur ces trois colonnes ensemble.
create index if not exists comment_examples_pick_idx
  on comment_examples (sur_mon_post, categorie, date desc);

-- HNSW plutôt qu'IVFFlat : à trois mille lignes, IVFFlat demande un
-- entraînement sur des données déjà présentes et se dégrade quand la table
-- grossit ensuite. HNSW se construit à l'insertion et ne demande aucun
-- recalibrage. Cosinus parce que `gte-small` rend des vecteurs normalisés.
create index if not exists comment_examples_embedding_idx
  on comment_examples using hnsw (embedding extensions.vector_cosine_ops);

-- ── Journal ────────────────────────────────────────────────────────────────
create table if not exists comment_generations (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  mode             text not null check (mode in ('commentaire', 'reponse')),
  -- L'un ou l'autre selon le mode. `on delete set null` : supprimer une
  -- publication ne doit pas effacer ce qu'on a appris d'elle.
  post_id          uuid references posts(id) on delete set null,
  comment_id       uuid references received_comments(id) on delete set null,
  intention        text,
  exemples_ids     bigint[] not null default '{}',
  -- Empreinte du cerveau utilisé. Une modification du cerveau change cette
  -- valeur : c'est ce qui permet de comparer un avant et un après sans se
  -- fier à une date de déploiement.
  cerveau_version  text not null,
  model            text not null,
  sortie_brute     jsonb,
  -- Une entrée par variante : slot, texte, badges levés, identifiants cités.
  variantes        jsonb not null default '[]'::jsonb,
  post_exploitable boolean,
  -- null tant qu'aucune proposition n'est retenue. C'est un signal, pas un
  -- trou : une génération dont rien n'est pris est la donnée la plus utile
  -- du lot.
  slot_choisi      text,
  texte_publie     text,
  -- Levenshtein normalisée entre la variante choisie et le texte publié.
  -- 0 = publié tel quel, 1 = entièrement réécrit.
  distance_edition real,
  usage            jsonb,
  latence_ms       integer
);

create index if not exists comment_generations_created_idx
  on comment_generations (created_at desc);

-- ── Similarité thématique ──────────────────────────────────────────────────
-- Fonction plutôt que requête côté app : l'opérateur `<=>` n'est pas
-- exprimable via PostgREST, et faire remonter trois mille vecteurs de 384
-- dimensions dans Node pour les comparer serait absurde.
create or replace function match_comment_examples(
  query_embedding  extensions.vector(384),
  want_sur_mon_post boolean,
  match_count      integer default 20,
  since_date       timestamptz default '2024-01-01'::timestamptz,
  exclude_categories text[] default '{}'
)
returns table (id bigint, texte text, categorie text, mots integer, date timestamptz)
language sql
stable
set search_path = public, extensions
as $$
  select e.id, e.texte, e.categorie, e.mots, e.date
    from comment_examples e
   where e.embedding is not null
     and e.sur_mon_post = want_sur_mon_post
     and e.date >= since_date
     and not (e.categorie = any(exclude_categories))
   order by e.embedding <=> query_embedding
   limit greatest(1, match_count);
$$;

-- ── Frontière ──────────────────────────────────────────────────────────────
-- Même raisonnement qu'en 003 : l'app n'accède à la base que côté serveur
-- avec la service role key. RLS activée sans aucune politique refuse tout aux
-- rôles exposés par PostgREST ; service_role, porteur de BYPASSRLS, passe.
alter table comment_examples    enable row level security;
alter table comment_generations enable row level security;

-- Le corpus est la voix de Théo et le journal contient des textes publiés
-- sous son nom : ni l'un ni l'autre ne doit être interrogeable avec la clé
-- anon, pas même en lecture.
revoke all on function match_comment_examples(
  extensions.vector(384), boolean, integer, timestamptz, text[]
) from public, anon, authenticated;
grant execute on function match_comment_examples(
  extensions.vector(384), boolean, integer, timestamptz, text[]
) to service_role;

-- ── Export mensuel ─────────────────────────────────────────────────────────
-- Les paires (variante générée → texte publié) les plus retouchées, dans
-- l'ordre où elles méritent d'être relues. C'est la matière première de la
-- mise à jour du cerveau : là où Théo corrige le plus, le cerveau se trompe.
-- `security_invoker` n'est PAS décoratif ici. Sans lui, une vue s'exécute avec
-- les droits de son créateur : elle traverse la RLS de `comment_generations`
-- et rendrait lisible à la clé anon tout ce qui a été publié sous le nom de
-- Théo. Avec lui, la vue hérite des droits de l'appelant — donc de rien, pour
-- anon. C'est exactement le trou que l'analyseur Supabase avait relevé en 003,
-- et je viens de le rouvrir d'un cran plus loin.
create or replace view comment_edits_to_review
with (security_invoker = true) as
  select g.created_at,
         g.mode,
         g.slot_choisi,
         g.intention,
         g.cerveau_version,
         g.distance_edition,
         (select v ->> 'texte'
            from jsonb_array_elements(g.variantes) v
           where v ->> 'slot' = g.slot_choisi
           limit 1) as variante_generee,
         g.texte_publie
    from comment_generations g
   where g.slot_choisi is not null
     and g.texte_publie is not null
     and coalesce(g.distance_edition, 0) > 0
   order by g.distance_edition desc, g.created_at desc;

revoke all on comment_edits_to_review from public, anon, authenticated;
grant select on comment_edits_to_review to service_role;
