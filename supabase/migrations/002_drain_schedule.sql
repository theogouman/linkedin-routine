-- ════════════════════════════════════════════════════════════════════════════
-- 002 — Ordonnancement de la purge de la file d'écriture depuis Postgres.
--
-- POURQUOI PAS UN CRON VERCEL : le plan Hobby n'accepte qu'une exécution par
-- jour et par expression. Or la file doit être visitée toutes les quelques
-- minutes — non pour envoyer plus, mais parce que la cadence (délai aléatoire
-- de 3 à 12 min entre deux envois) impose des créneaux fins. Un passage
-- quotidien enverrait deux actions par jour et la file ne se viderait jamais.
--
-- pg_cron tourne dans la base déjà provisionnée, gratuitement, à la minute
-- près. Plus fiable qu'un cron GitHub Actions (souvent 10 à 20 min de retard)
-- et sans l'abonnement Pro.
--
-- La fréquence de passage ne détermine PAS le rythme d'envoi : c'est la
-- politique (plafonds, délai aléatoire, fenêtre diurne) qui décide, et elle
-- est réappliquée à chaque appel. Visiter la file plus souvent ne fait jamais
-- partir plus d'actions.
--
-- ── CETTE MIGRATION S'APPLIQUE TELLE QUELLE ─────────────────────────────────
-- Aucun placeholder à remplacer : elle laisse la configuration VIDE et les
-- deux fonctions ne font rien tant qu'elle l'est. On évite ainsi qu'un
-- copier-coller distrait programme des appels vers `<APP_URL>` toutes les
-- cinq minutes.
--
-- Une fois l'app déployée, une seule instruction l'active (cf. bas de fichier).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Les réglages vivent en table plutôt qu'en dur dans la commande du job :
-- changer l'URL ou le secret devient un UPDATE, pas une reprogrammation.
create table if not exists drain_config (
  id          integer primary key default 1 check (id = 1),
  app_url     text,
  cron_secret text,
  updated_at  timestamptz not null default now()
);

insert into drain_config (id) values (1) on conflict (id) do nothing;

-- Le secret n'est lisible que par le rôle de service.
revoke all on drain_config from anon, authenticated;

/**
 * Appelle une route d'ordonnanceur de l'app.
 *
 * Ne fait rien tant que la configuration est absente : mieux vaut un
 * ordonnanceur inerte qu'un job qui empile des appels en échec toutes les
 * cinq minutes, et dont personne ne lit les journaux.
 */
create or replace function public.call_app_cron(route text, timeout_ms integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config drain_config%rowtype;
begin
  select * into config from drain_config where id = 1;

  if not found
     or config.app_url is null
     or config.cron_secret is null
     or config.app_url = ''
     or config.cron_secret = ''
     or config.app_url like '<%'
  then
    return;
  end if;

  perform net.http_get(
    url := rtrim(config.app_url, '/') || route,
    headers := jsonb_build_object('Authorization', 'Bearer ' || config.cron_secret),
    timeout_milliseconds := timeout_ms
  );
end;
$$;

create or replace function public.trigger_write_queue_drain()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_app_cron('/api/cron/drain', 30000);
end;
$$;

-- Seconde vérification quotidienne des nouveautés : FR-014 en demande deux,
-- le plan Hobby n'autorise qu'un cron côté Vercel — celle-ci complète l'autre.
create or replace function public.trigger_notify_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_app_cron('/api/cron/notify', 300000);
end;
$$;

-- Reprogrammation idempotente : rejouer la migration ne crée pas de doublon.
select cron.unschedule('drain-write-queue')
where exists (select 1 from cron.job where jobname = 'drain-write-queue');

select cron.schedule(
  'drain-write-queue',
  '*/5 * * * *',
  $$select public.trigger_write_queue_drain();$$
);

select cron.unschedule('notify-check-afternoon')
where exists (select 1 from cron.job where jobname = 'notify-check-afternoon');

select cron.schedule(
  'notify-check-afternoon',
  '0 16 * * *',
  $$select public.trigger_notify_check();$$
);

-- ════════════════════════════════════════════════════════════════════════════
-- ACTIVATION — à exécuter une fois l'app déployée, avec TES valeurs.
-- Tant que ce n'est pas fait, les deux jobs tournent à vide sans rien appeler.
--
--   update drain_config
--      set app_url     = 'https://ton-app.vercel.app',
--          cron_secret = 'la valeur de CRON_SECRET sur Vercel',
--          updated_at  = now()
--    where id = 1;
--
-- ⚠️ Si la Deployment Protection (SSO) de Vercel est active sur le domaine
--    visé, ces appels recevront une redirection d'authentification au lieu de
--    la route. Soit tu la désactives, soit tu pointes app_url sur un domaine
--    personnalisé (la protection « all except custom domains » les épargne),
--    soit tu ajoutes un Protection Bypass for Automation.
--
-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
--   select jobname, schedule, active from cron.job;
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, created
--     from net._http_response order by id desc limit 10;
--
-- Un status_code 200 : la purge répond.
-- Un 401 : le cron_secret ne correspond pas à CRON_SECRET côté Vercel.
-- Un 303/307 vers une page d'authentification : c'est la Deployment Protection.
-- ════════════════════════════════════════════════════════════════════════════
