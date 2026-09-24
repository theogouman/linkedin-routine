-- 005 — Helper d'import de listes depuis une source externe (MyFeedIn, CSV…).
--
-- Voir docs/IMPORT-MYFEEDIN.md pour le contexte et les résultats.
--
-- Les URLs reçues doivent être DÉJÀ CANONIQUES : la canonicalisation vit
-- exclusivement dans `src/modules/lists/lib/profile-url.ts`. Une première
-- version dupliquait cette règle en SQL, et les deux implémentations ont
-- divergé sur les slugs à emoji — le TypeScript décode puis ré-encode le
-- percent-encoding (`%E2%98%80`), le SQL se contentait de mettre en minuscules
-- (`%e2%98%80`). Deux URL pour la même personne selon le chemin d'entrée, donc
-- deux comptes. Cette fonction valide et refuse, elle ne répare pas.
--
-- Idempotent : rejouer le même import ne crée ni liste jumelle, ni compte en
-- double, ni rattachement en double.

create or replace function public.import_feed(
  feed_name text,
  people jsonb
)
returns table (liste text, comptes_crees integer, rattachements_crees integer, ignores integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Préfixés `v_` : sans cela, les noms entrent en collision avec les colonnes
  -- de `list_accounts` et PL/pgSQL refuse l'insertion comme ambiguë.
  v_list_id uuid;
  v_next_position integer;
  v_created_accounts integer := 0;
  v_created_links integer := 0;
  v_skipped integer := 0;
  v_person jsonb;
  v_url text;
  v_account_id uuid;
begin
  select coalesce(max(l.position) + 1, 0) into v_next_position from lists l;

  insert into lists (name, position)
  values (feed_name, v_next_position)
  on conflict (lower(name)) do nothing;

  select l.id into v_list_id from lists l where lower(l.name) = lower(feed_name);

  for v_person in select * from jsonb_array_elements(people) loop
    v_url := v_person ->> 'url';

    if v_url is null or v_url !~ '^https://www\.linkedin\.com/in/[^/?#]+$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select a.id into v_account_id from accounts a where a.profile_url = v_url;

    if v_account_id is null then
      insert into accounts (profile_url, public_identifier, name)
      values (
        v_url,
        substring(v_url from '/in/(.+)$'),
        nullif(trim(v_person ->> 'name'), '')
      )
      returning id into v_account_id;
      v_created_accounts := v_created_accounts + 1;
    else
      -- On ne complète que ce qui manque : ce qui vient de LinkedIn est plus
      -- frais que cet import.
      update accounts a
         set name = coalesce(a.name, nullif(trim(v_person ->> 'name'), ''))
       where a.id = v_account_id;
    end if;

    insert into list_accounts (list_id, account_id)
    values (v_list_id, v_account_id)
    on conflict (list_id, account_id) do nothing;

    if found then
      v_created_links := v_created_links + 1;
    end if;
  end loop;

  return query select feed_name, v_created_accounts, v_created_links, v_skipped;
end;
$$;

-- Comme les fonctions d'ordonnancement : SECURITY DEFINER donc exposée via
-- /rest/v1/rpc/ si on n'y prend pas garde.
revoke execute on function public.import_feed(text, jsonb) from public, anon, authenticated;
