import "server-only";

import webpush from "web-push";
import { db, unwrap } from "@/shared/lib/db";
import { readEnv } from "@/shared/lib/env";
import type { PushSubscriptionRow } from "@/shared/lib/rows";
import { buildPushMessage, type PendingCounts } from "../lib/message";

/** Notifications push web (FR-014). */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = readEnv("VAPID_PUBLIC_KEY");
  const privateKey = readEnv("VAPID_PRIVATE_KEY");
  const subject = readEnv("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function saveSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  const { error } = await db()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (error) throw new Error(`Enregistrement de l'abonnement push : ${error.message}`);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const { error } = await db()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) throw new Error(`Suppression de l'abonnement push : ${error.message}`);
}

export async function countSubscriptions(): Promise<number> {
  const { count, error } = await db()
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Comptage des abonnements : ${error.message}`);
  return count ?? 0;
}

export interface PushSendReport {
  sent: number;
  removed: number;
  skipped: string | null;
}

/**
 * Envoie une notification à tous les appareils enregistrés.
 *
 * Un abonnement rejeté en 404/410 est supprimé : le navigateur l'a révoqué
 * (PWA désinstallée, données effacées) et le garder ferait échouer chaque
 * envoi suivant indéfiniment.
 */
export async function notifyPending(counts: PendingCounts): Promise<PushSendReport> {
  const message = buildPushMessage(counts);
  if (!message) return { sent: 0, removed: 0, skipped: "rien à signaler" };
  if (!ensureConfigured()) {
    return { sent: 0, removed: 0, skipped: "clés VAPID non configurées" };
  }

  const subscriptions = unwrap(
    await db().from("push_subscriptions").select("*"),
    "lecture des abonnements push",
  ) as PushSubscriptionRow[];

  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(message),
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await removeSubscription(subscription.endpoint);
        removed += 1;
      }
    }
  }

  return { sent, removed, skipped: null };
}

/** Alerte de coupe-circuit (FR-018) — toujours envoyée, jamais silencieuse. */
export async function notifyQueueSuspended(reason: string): Promise<void> {
  if (!ensureConfigured()) return;
  const subscriptions = unwrap(
    await db().from("push_subscriptions").select("*"),
    "lecture des abonnements push",
  ) as PushSubscriptionRow[];

  const payload = JSON.stringify({
    title: "File suspendue",
    body: `${reason} Reprise manuelle requise après 72 h.`,
    url: "/file",
  });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    } catch {
      // Une alerte non délivrée ne doit pas masquer la suspension elle-même,
      // qui est déjà enregistrée en base et visible dans l'app.
    }
  }
}
