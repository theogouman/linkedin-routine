-- Compteurs d'engagement : déjà présents dans la charge utile de l'actor
-- (`engagement.reactions[]`, `engagement.comments`), donc gratuits. Les
-- stocker ne coûte rien de plus qu'une colonne ; ne pas les stocker obligerait
-- à re-scraper pour les afficher.
--
-- Nullable et non pas `default 0` : « aucune réaction » et « le fournisseur ne
-- l'a pas dit » ne sont pas la même chose, et afficher « 0 » sur la seconde
-- serait un mensonge.
alter table posts add column if not exists reaction_count integer;
alter table posts add column if not exists comment_count integer;

-- Type de réaction (FR-013 étendu).
--
-- `like` est la valeur par défaut : c'est le comportement historique, et les
-- lignes déjà en file doivent partir exactement comme elles ont été validées.
-- La contrainte énumère les six réactions LinkedIn plutôt que d'accepter du
-- texte libre — une valeur inconnue serait refusée par l'API au moment de
-- l'envoi, c'est-à-dire trop tard, après la mise en file.
alter table write_actions
  add column if not exists reaction_type text not null default 'like';

alter table write_actions drop constraint if exists write_actions_reaction_type_check;
alter table write_actions add constraint write_actions_reaction_type_check
  check (reaction_type in ('like','celebrate','support','love','insightful','funny'));

-- Réaction réellement posée sur une publication, pour la restituer à
-- l'affichage : `liked_at` dit QUAND, pas QUOI.
alter table posts add column if not exists reaction_type text;
alter table posts drop constraint if exists posts_reaction_type_check;
alter table posts add constraint posts_reaction_type_check
  check (reaction_type is null or reaction_type in ('like','celebrate','support','love','insightful','funny'));

alter table received_comments add column if not exists reaction_type text;
alter table received_comments drop constraint if exists received_comments_reaction_type_check;
alter table received_comments add constraint received_comments_reaction_type_check
  check (reaction_type is null or reaction_type in ('like','celebrate','support','love','insightful','funny'));
