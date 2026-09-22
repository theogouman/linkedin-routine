import "server-only";

import { APP_TIMEZONE } from "@/shared/lib/env";
import { DEFAULT_POLICY, type QueuePolicy, type RampState } from "../lib/policy";
import { getQueueState, readSetting, writeSetting } from "./repository";

export const POLICY_SETTING_KEY = "queue_policy";
export const NOTIFY_SETTING_KEY = "notify_checks_per_day";

/**
 * Politique effective = valeurs de FR-017 surchargées par les réglages.
 *
 * La fusion est partielle et champ par champ : l'utilisateur peut baisser le
 * seul plafond de likes sans avoir à redéfinir la fenêtre horaire, et une
 * clé absente du réglage retombe toujours sur la valeur de la spec.
 */
export async function loadPolicy(): Promise<QueuePolicy> {
  const stored = await readSetting<Partial<QueuePolicy>>(POLICY_SETTING_KEY);
  const base: QueuePolicy = { ...DEFAULT_POLICY, timezone: APP_TIMEZONE };
  if (!stored) return base;
  return {
    ...base,
    ...stored,
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
  await writeSetting(POLICY_SETTING_KEY, policy);
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
