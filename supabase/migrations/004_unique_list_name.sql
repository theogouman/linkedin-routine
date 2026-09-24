-- 004 — Un nom de liste est unique.
--
-- Rien ne l'imposait, si bien qu'un import rejoué créait des listes jumelles
-- au lieu de compléter les existantes. La contrainte rend tout import
-- idempotent : `on conflict (lower(name)) do nothing` suffit désormais.
create unique index if not exists lists_name_uniq on lists (lower(name));
