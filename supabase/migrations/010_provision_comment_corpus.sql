-- ════════════════════════════════════════════════════════════════════════════
-- 010 — Installation automatique du corpus de commentaires.
--
-- Le corpus de 2 940 commentaires est un fichier du dépôt, pas une donnée à
-- importer à la main. L'app sait le mettre en base et calculer ses embeddings ;
-- il ne manquait que quelqu'un pour le lui demander.
--
-- C'est l'ordonnanceur Postgres qui le fait, comme pour la purge de la file.
-- La route est idempotente et reprenable : tant qu'il reste des lignes ou des
-- vecteurs à produire, chaque passage avance ; une fois tout en place, elle ne
-- coûte que deux comptages.
--
-- Toutes les dix minutes, et pas plus souvent : un passage peut durer jusqu'à
-- cinq minutes quand il calcule des embeddings, et deux passages qui se
-- chevauchent traiteraient les mêmes lignes.
--
-- Le job reste programmé après l'installation. C'est volontaire : il remet
-- l'app en état si la base est restaurée, et il rattrape tout seul l'ajout de
-- nouveaux exemples au fichier — l'empreinte change, l'import repart.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.trigger_comment_provision()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.call_app_cron('/api/cron/provision', 300000);
end;
$$;

-- Même verrouillage qu'en 003 : ces fonctions sont SECURITY DEFINER et ne
-- doivent être appelables que par pg_cron, jamais via /rest/v1/rpc/.
revoke all on function public.trigger_comment_provision() from public, anon, authenticated;

select cron.unschedule('provision-comment-corpus')
where exists (select 1 from cron.job where jobname = 'provision-comment-corpus');

select cron.schedule(
  'provision-comment-corpus',
  '*/10 * * * *',
  $$select public.trigger_comment_provision();$$
);
