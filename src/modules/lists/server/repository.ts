import "server-only";

import { db, unwrap } from "@/shared/lib/db";
import type { AccountRow, FetchState, ListRow } from "@/shared/lib/rows";
import { normalizeProfileUrl, parseBulkProfileUrls } from "@/shared/lib/linkedin-url";

/** Listes et comptes suivis (FR-001, FR-002). */

export interface ListWithCount extends ListRow {
  accountCount: number;
  restrictedCount: number;
}

export async function getLists(): Promise<ListWithCount[]> {
  const lists = unwrap(
    await db().from("lists").select("*").order("position").order("created_at"),
    "lecture des listes",
  ) as ListRow[];

  const memberships = unwrap(
    await db().from("list_accounts").select("list_id, accounts(fetch_state)"),
    "lecture des membres de listes",
  ) as Array<{ list_id: string; accounts: { fetch_state: FetchState } | null }>;

  return lists.map((list) => {
    const members = memberships.filter((row) => row.list_id === list.id);
    return {
      ...list,
      accountCount: members.length,
      restrictedCount: members.filter(
        (row) => row.accounts?.fetch_state === "restricted",
      ).length,
    };
  });
}

export async function createList(name: string): Promise<ListRow> {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Le nom de la liste est obligatoire.");
  const existing = unwrap(
    await db().from("lists").select("position").order("position", { ascending: false }).limit(1),
    "lecture de la position",
  ) as Array<{ position: number }>;
  const position = (existing[0]?.position ?? -1) + 1;

  const rows = unwrap(
    await db().from("lists").insert({ name: trimmed, position }).select(),
    "création de la liste",
  ) as ListRow[];
  const created = rows[0];
  if (!created) throw new Error("Création de la liste : aucune ligne renvoyée.");
  return created;
}

export async function renameList(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("Le nom de la liste est obligatoire.");
  unwrap(
    await db().from("lists").update({ name: trimmed }).eq("id", id).select(),
    "renommage de la liste",
  );
}

/**
 * Supprime une liste. Les publications déjà récupérées restent en base
 * (FR-003, conservation permanente) — seul le rattachement disparaît.
 */
export async function deleteList(id: string): Promise<void> {
  const { error } = await db().from("lists").delete().eq("id", id);
  if (error) throw new Error(`Suppression de la liste : ${error.message}`);
}

export interface AccountWithLists extends AccountRow {
  listIds: string[];
  postCount: number;
}

export async function getAccounts(listId?: string): Promise<AccountWithLists[]> {
  const memberships = unwrap(
    await db().from("list_accounts").select("list_id, account_id"),
    "lecture des rattachements",
  ) as Array<{ list_id: string; account_id: string }>;

  let query = db().from("accounts").select("*").eq("is_self", false);
  if (listId) {
    const ids = memberships.filter((m) => m.list_id === listId).map((m) => m.account_id);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }
  const accounts = unwrap(await query.order("name"), "lecture des comptes") as AccountRow[];

  const counts = unwrap(
    await db().from("posts").select("account_id"),
    "comptage des publications",
  ) as Array<{ account_id: string | null }>;

  return accounts.map((account) => ({
    ...account,
    listIds: memberships.filter((m) => m.account_id === account.id).map((m) => m.list_id),
    postCount: counts.filter((row) => row.account_id === account.id).length,
  }));
}

export interface AddAccountsResult {
  added: number;
  alreadyPresent: number;
  rejected: Array<{ input: string; reason: string }>;
}

/**
 * Ajoute des comptes à une liste depuis un collage d'URLs (FR-002).
 *
 * Le rattachement est idempotent : recoller la même liste n'ajoute rien et ne
 * lève pas. Les entrées invalides sont rendues à l'appelant avec leur texte
 * d'origine pour être affichées telles quelles.
 */
export async function addAccountsToList(
  listId: string,
  rawInput: string,
): Promise<AddAccountsResult> {
  const parsed = parseBulkProfileUrls(rawInput);
  const rejected = parsed.rejected.map((entry) => ({
    input: entry.input,
    reason: entry.reason,
  }));

  if (parsed.accepted.length === 0) {
    return { added: 0, alreadyPresent: parsed.duplicates.length, rejected };
  }

  const urls = parsed.accepted.map((profile) => profile.url);
  const existing = unwrap(
    await db().from("accounts").select("*").in("profile_url", urls),
    "lecture des comptes existants",
  ) as AccountRow[];
  const existingByUrl = new Map(existing.map((account) => [account.profile_url, account]));

  const toInsert = parsed.accepted
    .filter((profile) => !existingByUrl.has(profile.url))
    .map((profile) => ({
      profile_url: profile.url,
      public_identifier: profile.publicIdentifier,
      name: null,
    }));

  let inserted: AccountRow[] = [];
  if (toInsert.length > 0) {
    inserted = unwrap(
      await db()
        .from("accounts")
        .upsert(toInsert, { onConflict: "profile_url", ignoreDuplicates: false })
        .select(),
      "création des comptes",
    ) as AccountRow[];
  }

  const allIds = [...existing.map((a) => a.id), ...inserted.map((a) => a.id)];
  const links = unwrap(
    await db().from("list_accounts").select("account_id").eq("list_id", listId),
    "lecture des rattachements existants",
  ) as Array<{ account_id: string }>;
  const linked = new Set(links.map((link) => link.account_id));
  const newLinks = allIds.filter((id) => !linked.has(id));

  if (newLinks.length > 0) {
    const { error } = await db()
      .from("list_accounts")
      .upsert(
        newLinks.map((accountId) => ({ list_id: listId, account_id: accountId })),
        { onConflict: "list_id,account_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Rattachement à la liste : ${error.message}`);
  }

  return {
    added: newLinks.length,
    alreadyPresent: allIds.length - newLinks.length + parsed.duplicates.length,
    rejected,
  };
}

export async function removeAccountFromList(
  listId: string,
  accountId: string,
): Promise<void> {
  const { error } = await db()
    .from("list_accounts")
    .delete()
    .eq("list_id", listId)
    .eq("account_id", accountId);
  if (error) throw new Error(`Retrait du compte : ${error.message}`);
}

/**
 * Comptes dont l'identité visuelle est encore vide.
 *
 * Un compte importé en masse n'a ni nom ni photo tant qu'aucune publication
 * n'a été récupérée pour lui — et un créateur qui n'a rien publié sur la
 * fenêtre n'en aura jamais. D'où une passe d'enrichissement séparée, que cette
 * requête alimente.
 *
 * Les profils restreints sont exclus : les réinterroger coûterait à chaque
 * passe pour un résultat connu d'avance.
 */
export async function getAccountsMissingProfile(limit: number): Promise<AccountRow[]> {
  return unwrap(
    await db()
      .from("accounts")
      .select("*")
      .neq("fetch_state", "restricted")
      .or("avatar_url.is.null,name.is.null")
      .order("created_at")
      .limit(limit),
    "lecture des comptes sans photo",
  ) as AccountRow[];
}

/** Nombre de comptes encore sans photo ni nom — affiché dans les listes. */
export async function countAccountsMissingProfile(): Promise<number> {
  const { count, error } = await db()
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .neq("fetch_state", "restricted")
    .or("avatar_url.is.null,name.is.null");
  if (error) throw new Error(`Comptage des comptes sans photo : ${error.message}`);
  return count ?? 0;
}

/** Comptes à interroger à la prochaine actualisation — hors profils restreints. */
export async function getSyncableAccounts(): Promise<AccountRow[]> {
  return unwrap(
    await db()
      .from("accounts")
      .select("*")
      .neq("fetch_state", "restricted")
      .order("created_at"),
    "lecture des comptes à synchroniser",
  ) as AccountRow[];
}

export async function setAccountFetchState(
  accountId: string,
  state: FetchState,
  error: string | null,
): Promise<void> {
  const { error: dbError } = await db()
    .from("accounts")
    .update({ fetch_state: state, fetch_error: error })
    .eq("id", accountId);
  if (dbError) throw new Error(`Mise à jour de l'état du compte : ${dbError.message}`);
}

export async function updateAccountProfile(
  accountId: string,
  profile: { name?: string | null; headline?: string | null; avatarUrl?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (profile.name != null) patch.name = profile.name;
  if (profile.headline != null) patch.headline = profile.headline;
  if (profile.avatarUrl != null) patch.avatar_url = profile.avatarUrl;
  if (Object.keys(patch).length === 0) return;
  const { error } = await db().from("accounts").update(patch).eq("id", accountId);
  if (error) throw new Error(`Mise à jour du profil : ${error.message}`);
}

/**
 * Compte de l'utilisateur (FR-012) : porteur des publications dont on suit les
 * commentaires reçus. Créé à la volée depuis les réglages.
 */
export async function ensureSelfAccount(profileUrlInput: string): Promise<AccountRow> {
  const normalized = normalizeProfileUrl(profileUrlInput);
  if (!normalized.ok) {
    throw new Error("URL de profil LinkedIn invalide pour le compte utilisateur.");
  }
  const rows = unwrap(
    await db()
      .from("accounts")
      .upsert(
        {
          profile_url: normalized.value.url,
          public_identifier: normalized.value.publicIdentifier,
          is_self: true,
        },
        { onConflict: "profile_url" },
      )
      .select(),
    "création du compte utilisateur",
  ) as AccountRow[];
  const account = rows[0];
  if (!account) throw new Error("Compte utilisateur : aucune ligne renvoyée.");
  if (!account.is_self) {
    await db().from("accounts").update({ is_self: true }).eq("id", account.id);
    return { ...account, is_self: true };
  }
  return account;
}

export async function getSelfAccount(): Promise<AccountRow | null> {
  const rows = unwrap(
    await db().from("accounts").select("*").eq("is_self", true).limit(1),
    "lecture du compte utilisateur",
  ) as AccountRow[];
  return rows[0] ?? null;
}
