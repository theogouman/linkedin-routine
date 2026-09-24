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
-- près. C'est plus fiable qu'un cron GitHub Actions (souvent en retard de
-- 10 à 20 minutes) et ça ne coûte pas l'abonnement Pro.
--
-- La fréquence de passage ne détermine PAS le rythme d'envoi : c'est la
-- politique (plafonds, délai aléatoire, fenêtre diurne) qui décide, et elle
-- est appliquée à chaque appel. Visiter la file plus souvent ne fait jamais
-- partir plus d'actions.
--
-- ── À FAIRE AVANT D'EXÉCUTER ────────────────────────────────────────────────
-- Remplace les deux valeurs ci-dessous par les tiennes :
--   <APP_URL>      ex. https://linkedin-routine.vercel.app  (sans / final)
--   <CRON_SECRET>  la même valeur que la variable CRON_SECRET de Vercel
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Les réglages sont stockés en base plutôt qu'écrits en dur dans la commande
-- du job : les changer ne demande alors qu'un UPDATE, pas une reprogrammation.
create table if not exists drain_config (
  id          integer primary key default 1 check (id = 1),
  app_url     text not null,
  cron_secret text not null,
  updated_at  timestamptz not null default now()
);

insert into drain_config (id, app_url, cron_secret)
values (1, '<APP_URL>', '<CRON_SECRET>')
on conflict (id) do update
  set app_url = excluded.app_url,
      cron_secret = excluded.cron_secret,
      updated_at = now();

-- Personne d'autre que le rôle de service ne doit lire le secret.
revoke all on drain_config from anon, authenticated;

create or replace function public.trigger_write_queue_drain()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config drain_config%rowtype;
begin
  select * into config from drain_config where id = 1;
  if not found or config.app_url like '<%' then
    -- Configuration non renseignée : on ne tente rien plutôt que d'empiler
    -- des appels en échec toutes les cinq minutes.
    return;
  end if;

  perform net.http_get(
    url := config.app_url || '/api/cron/drain',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || config.cron_secret
    ),
    timeout_milliseconds := 30000
  );
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

-- Seconde vérification quotidienne des nouveautés (FR-014 en demande deux,
-- le plan Hobby n'en autorise qu'une côté Vercel — celle-ci complète l'autre).
create or replace function public.trigger_notify_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config drain_config%rowtype;
begin
  select * into config from drain_config where id = 1;
  if not found or config.app_url like '<%' then
    return;
  end if;

  perform net.http_get(
    url := config.app_url || '/api/cron/notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || config.cron_secret
    ),
    timeout_milliseconds := 300000
  );
end;
$$;

select cron.unschedule('notify-check-afternoon')
where exists (select 1 from cron.job where jobname = 'notify-check-afternoon');

select cron.schedule('notify-check-afternoon', '0 16 * * *', $$select public.trigger_notify_check();$$);

-- ── Vérification ────────────────────────────────────────────────────────────
-- Les deux jobs programmés :
--   select jobname, schedule, active from cron.job;
-- Les dernières exécutions et leur statut :
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
-- Les réponses HTTP reçues par pg_net :
--   select id, status_code, created from net._http_response order by id desc limit 10;
