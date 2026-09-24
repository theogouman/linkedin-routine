-- ════════════════════════════════════════════════════════════════════════════
-- 003 — Fermeture de l'API publique PostgREST.
--
-- Deux trous relevés par l'analyseur de sécurité Supabase après la 002, et
-- corrigés ici. Le premier contredit un choix que j'avais documenté comme
-- délibéré dans la 001 ; l'analyseur avait raison.
--
-- 1. RLS ABSENTE SUR LES TABLES PUBLIQUES (niveau ERROR)
--    L'app n'accède à la base que côté serveur avec la service role key. J'en
--    avais conclu que la RLS était inutile. C'est faux : les tables restaient
--    exposées par PostgREST à quiconque détiendrait la clé anon. La défense
--    reposait donc sur « cette clé n'est publiée nulle part », ce qui n'est
--    pas une frontière.
--    RLS activée SANS aucune politique refuse tout aux rôles qui y sont
--    soumis (anon, authenticated) ; service_role, porteur de BYPASSRLS,
--    continue d'accéder à tout. L'app ne change pas d'une ligne, la frontière
--    devient réelle. Coût : nul.
--
-- 2. FONCTIONS D'ORDONNANCEMENT APPELABLES PAR ANON (niveau WARN)
--    Les trois fonctions de la 002 sont SECURITY DEFINER et étaient donc
--    exposées via /rest/v1/rpc/. `call_app_cron` acceptait en plus une route
--    arbitraire : de quoi faire émettre à la base des requêtes authentifiées
--    portant le vrai CRON_SECRET vers n'importe quel chemin de l'app. Seul
--    pg_cron doit pouvoir les appeler.
--
-- Reste un avertissement non traité : `pg_net` est installé dans le schéma
-- `public` (c'est le défaut Supabase). Le déplacer risquerait de casser les
-- références `net.http_get` des fonctions d'ordonnancement, pour un gain de
-- lint. Un ordonnanceur cassé coûte plus cher qu'un WARN.
-- ════════════════════════════════════════════════════════════════════════════

alter table lists              enable row level security;
alter table accounts           enable row level security;
alter table list_accounts      enable row level security;
alter table posts              enable row level security;
alter table received_comments  enable row level security;
alter table write_actions      enable row level security;
alter table sync_cursors       enable row level security;
alter table queue_state        enable row level security;
alter table settings           enable row level security;
alter table push_subscriptions enable row level security;
alter table sync_runs          enable row level security;
alter table drain_config       enable row level security;

-- Aucune politique n'est créée, volontairement : c'est ce qui produit le
-- refus par défaut. L'analyseur le signalera en INFO (`rls_enabled_no_policy`)
-- — c'est le comportement recherché, pas un oubli.

revoke execute on function public.call_app_cron(text, integer) from public, anon, authenticated;
revoke execute on function public.trigger_write_queue_drain() from public, anon, authenticated;
revoke execute on function public.trigger_notify_check() from public, anon, authenticated;
