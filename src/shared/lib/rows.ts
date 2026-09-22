/**
 * Formes des lignes telles que Postgres les renvoie.
 *
 * Déclarées à la main plutôt que générées : le schéma est petit, stable, et
 * une génération automatique ajouterait une étape de build pour un gain nul à
 * cette échelle. Les colonnes `timestamptz` arrivent en chaîne ISO — les
 * repositories les convertissent en `Date` au passage vers le domaine.
 */

export interface ListRow {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export type FetchState = "pending" | "ok" | "restricted";

export interface AccountRow {
  id: string;
  profile_url: string;
  public_identifier: string | null;
  provider_id: string | null;
  name: string | null;
  headline: string | null;
  avatar_url: string | null;
  is_self: boolean;
  fetch_state: FetchState;
  fetch_error: string | null;
  created_at: string;
}

export type MediaKindRow = "none" | "image" | "video" | "document" | "article";

export interface PostRow {
  id: string;
  provider_post_id: string;
  account_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  author_profile_url: string | null;
  body: string | null;
  media: unknown;
  media_kind: MediaKindRow;
  is_repost: boolean;
  post_url: string | null;
  published_at: string;
  fetched_at: string;
  is_own: boolean;
  liked_at: string | null;
  processed_at: string | null;
  processed_reason: "commented" | "ignored" | "liked" | null;
}

export interface ReceivedCommentRow {
  id: string;
  provider_comment_id: string;
  post_id: string;
  parent_comment_id: string | null;
  depth: number;
  author_name: string | null;
  author_profile_url: string | null;
  author_avatar_url: string | null;
  body: string | null;
  comment_url: string | null;
  published_at: string;
  fetched_at: string;
  liked_at: string | null;
  processed_at: string | null;
  processed_reason: "replied" | "ignored" | "liked" | null;
}

export type WriteStatus = "pending" | "sending" | "sent" | "cancelled" | "failed";
export type WriteOrigin = "manual" | "ai_edited" | "ai_unchanged";

export interface WriteActionRow {
  id: string;
  kind: "comment" | "reply" | "like";
  target_type: "post" | "comment";
  target_post_id: string | null;
  target_comment_id: string | null;
  body: string | null;
  media: unknown;
  origin: WriteOrigin;
  status: WriteStatus;
  scheduled_for: string;
  created_at: string;
  sent_at: string | null;
  attempts: number;
  error: string | null;
  provider_result: unknown;
}

export interface SyncCursorRow {
  key: string;
  last_synced_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

export interface QueueStateRow {
  id: number;
  status: "active" | "suspended";
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_signal: string | null;
  resumed_at: string | null;
  ramp_started_on: string;
  ramp_override: number | null;
  ramp_override_on: string | null;
}

export interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  last_seen_at: string;
}

export interface SyncRunRow {
  id: string;
  scope: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  accounts_synced: number;
  accounts_failed: number;
  posts_inserted: number;
  comments_inserted: number;
  error: string | null;
}
