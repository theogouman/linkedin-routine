import "server-only";

import { APP_TIMEZONE } from "@/shared/lib/env";
import { isValidTimezone } from "@/shared/lib/timezone";
import { DEFAULT_POLICY, type QueuePolicy, type RampState } from "../lib/policy";
import { readSetting, writeSetting } from "@/shared/lib/settings-store";
import { getQueueState } from "./repository";

export const POLICY_SETTING_KEY = "queue_policy";
export const NOTIFY_SETTING_KEY = "notify_checks_per_day";

/**
 * Politique effective = valeurs de FR-017 surchargées par les réglages.
 *
 * La fusion est partielle et champ par champ : l'utilisateur peut baisser le
 * seul plafond de likes sans avoir à redéfinir la fenêtre horaire, et une
 * clé absente du réglage retombe toujours sur la valeur de la spec.
 *
 * `APP_TIMEZONE` n'est plus qu'une amorce : le fuseau se règle dans l'app, et
 * la valeur en base prime dès qu'elle existe.
 */
export async function loadPolicy(): Promise<QueuePolicy> {
  const stored = await readSetting<Partial<QueuePolicy>>(POLICY_SETTING_KEY);
  const base: QueuePolicy = {
    ...DEFAULT_POLICY,
    timezone: isValidTimezone(APP_TIMEZONE) ? APP_TIMEZONE : DEFAULT_POLICY.timezone,
  };
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    // Un fuseau inconnu casserait toute l'arithmétique de cadence : on le
    // rejette à la lecture plutôt que de laisser `Intl` lever au premier envoi.
    timezone: isValidTimezone(stored.timezone) ? stored.timezone : base.timezone,
    caps: { ...base.caps, ...(stored.caps ?? {}) },
    delayMinutes: { ...base.delayMinutes, ...(stored.delayMinutes ?? {}) },
    window: {
      ...base.window,
      ...(stored.window ?? {}),
      middayPause:
        stored.window?.middayPause === undefined
          ? base.window.middayPause
          : stored.window.middayPause,
    },
    ramp: { ...base.ramp, ...(stored.ramp ?? {}) },
  };
}

export async function savePolicy(policy: Partial<QueuePolicy>): Promise<void> {
  if (policy.timezone !== undefined && !isValidTimezone(policy.timezone)) {
    throw new Error("Fuseau horaire inconnu.");
  }
  // Fusionné sur l'existant : l'UI n'envoie que les champs qu'elle affiche, et
  // un enregistrement ne doit pas effacer un réglage qu'elle ne montre pas.
  const current = await readSetting<Partial<QueuePolicy>>(POLICY_SETTING_KEY);
  await writeSetting(POLICY_SETTING_KEY, { ...(current ?? {}), ...policy });
}

export async function loadRampState(): Promise<RampState> {
  const state = await getQueueState();
  return {
    startedOn: state.ramp_started_on,
    overrideFactor: state.ramp_override,
  };
}

/** Fréquence des vérifications serveur pour les notifications (FR-014). */
export async function loadNotifyChecksPerDay(): Promise<number> {
  const stored = await readSetting<number>(NOTIFY_SETTING_KEY);
  return typeof stored === "number" && stored > 0 ? stored : 2;
}
