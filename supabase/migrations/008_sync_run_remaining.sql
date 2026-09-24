-- Comptes laissés pour le passage suivant.
--
-- Une actualisation tourne dans une fonction serverless, dont la durée est
-- plafonnée : à plusieurs centaines de comptes, elle est tuée avant sa fin.
-- Le travail déjà fait reste acquis — chaque curseur avance à son compte —
-- mais le journal gardait la ligne ouverte et rien ne disait où l'on en était.
alter table sync_runs add column if not exists accounts_remaining integer not null default 0;

-- Les passages restés ouverts sont fermés rétroactivement. `ok` reste null :
-- on ne sait pas s'ils ont réussi, seulement qu'ils ne se sont jamais
-- terminés — et l'écran de diagnostics doit pouvoir dire cela, plutôt que de
-- les afficher comme des échecs.
update sync_runs
   set error = coalesce(nullif(error, ''), 'Passage interrompu : la fonction a été arrêtée avant la fin.')
 where finished_at is null
   and started_at < now() - interval '10 minutes';
