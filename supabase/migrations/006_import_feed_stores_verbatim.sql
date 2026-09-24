-- `import_feed` valide et stocke tel quel, il ne « répare » plus.
--
-- La version précédente re-canonicalisait les URLs en SQL. Deux
-- implémentations de la même règle ont fini par diverger sur les slugs à
-- emoji : le TypeScript ré-encode en majuscules hexadécimales (`%E2%98%80`),
-- le SQL passait tout en minuscules (`%e2%98%80`). Deux comptes pour la même
-- personne selon le chemin d'entrée — et rien pour le signaler.
--
-- Le normaliseur TypeScript est désormais la seule source de vérité. Cette
-- fonction exige des URLs déjà canoniques, refuse le reste, et ne devine rien.
create or replace function import_feed(feed_name text, people jsonb)
returns table(liste text, comptes_crees integer, rattachements_crees integer, ignores integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
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

    -- Forme canonique attendue, produite en amont par le normaliseur de l'app.
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
$function$;

revoke execute on function import_feed(text, jsonb) from public, anon, authenticated;
