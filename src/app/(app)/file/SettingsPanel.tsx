"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Bell, ChevronDown, FileText, LogOut } from "lucide-react";
import {
  savePolicyAction,
  saveSyncSettingsAction,
  setSelfProfileAction,
} from "@/app/actions";
import { logout } from "@/modules/auth/server/actions";
import {
  NUMERIC_SYNC_SETTINGS,
  SYNC_SETTINGS_BOUNDS,
  type SyncSettings,
} from "@/modules/ingestion/lib/settings";
import { supportedTimezones } from "@/shared/lib/timezone";
import { formatMinuteOfDay, parseMinuteOfDay, relativeTime } from "@/shared/lib/format";

/**
 * Réglages : plafonds, fenêtre, fuseau, récupération, compte, process IA,
 * notifications, diagnostics.
 *
 * Replié par défaut. Ce sont des réglages qu'on touche une fois puis plus
 * jamais ; les laisser ouverts pousserait l'écran de la file — l'information
 * qu'on vient réellement consulter — sous la ligne de flottaison.
 */

const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

export interface PolicyView {
  caps: { comments: number; likes: number; total: number };
  delayMinutes: { min: number; max: number };
  maxCommentsPerHour: number;
  window: {
    days: number[];
    startMinute: number;
    endMinute: number;
    middayPause: { startMinute: number; endMinute: number } | null;
  };
  timezone: string;
}

export function SettingsPanel({
  policy,
  syncSettings,
  selfProfileUrl,
  processes,
  vapidPublicKey,
  pushSubscriptions,
  syncRuns,
  failedCursors,
}: {
  policy: PolicyView;
  syncSettings: SyncSettings;
  selfProfileUrl: string | null;
  processes: Array<{ kind: string; file: string; placeholder: boolean }>;
  vapidPublicKey: string | null;
  pushSubscriptions: number;
  syncRuns: Array<{
    id: string;
    scope: string;
    startedAt: string;
    finishedAt: string | null;
    ok: boolean | null;
    postsInserted: number;
    commentsInserted: number;
    error: string | null;
  }>;
  failedCursors: Array<{ key: string; failures: number; error: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [caps, setCaps] = useState(policy.caps);
  const [delay, setDelay] = useState(policy.delayMinutes);
  const [perHour, setPerHour] = useState(policy.maxCommentsPerHour);
  const [days, setDays] = useState(policy.window.days);
  const [start, setStart] = useState(formatMinuteOfDay(policy.window.startMinute));
  const [end, setEnd] = useState(formatMinuteOfDay(policy.window.endMinute));
  const [timezone, setTimezone] = useState(policy.timezone);
  const [sync, setSync] = useState<SyncSettings>(syncSettings);
  const [profileUrl, setProfileUrl] = useState(selfProfileUrl ?? "");

  // Calculée une fois : la liste complète des fuseaux d'ICU tient en quelques
  // centaines d'entrées, mais la reconstruire à chaque frappe ferait ramer le
  // panneau sur mobile.
  const timezones = useMemo(() => {
    const values = supportedTimezones();
    // Le fuseau enregistré peut manquer d'une liste tronquée : sans ça, le
    // `select` afficherait silencieusement autre chose que la valeur réelle.
    return values.includes(policy.timezone) ? values : [policy.timezone, ...values];
  }, [policy.timezone]);

  const savePolicy = () => {
    const startMinute = parseMinuteOfDay(start);
    const endMinute = parseMinuteOfDay(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      toast.error("Fenêtre horaire invalide : format HH:MM, fin après le début.");
      return;
    }
    startTransition(async () => {
      const result = await savePolicyAction({
        caps,
        delayMinutes: delay,
        maxCommentsPerHour: perHour,
        timezone,
        window: { days, startMinute, endMinute, middayPause: policy.window.middayPause },
      });
      if (result.ok) toast.success("Réglages enregistrés.");
      else toast.error(result.message ?? "Enregistrement impossible.");
      router.refresh();
    });
  };

  const saveSync = () => {
    startTransition(async () => {
      const result = await saveSyncSettingsAction(sync);
      if (result.ok) toast.success("Récupération enregistrée.");
      else toast.error(result.message ?? "Enregistrement impossible.");
      router.refresh();
    });
  };

  const saveProfile = () => {
    startTransition(async () => {
      const result = await setSelfProfileAction(profileUrl);
      if (result.ok) toast.success("Compte enregistré. Actualise pour récupérer tes publications.");
      else toast.error(result.message ?? "URL invalide.");
      router.refresh();
    });
  };

  const enablePush = async () => {
    if (!vapidPublicKey) {
      toast.error("Clés VAPID non configurées côté serveur.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Ce navigateur ne gère pas les notifications push.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permission refusée.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("enregistrement refusé");
      toast.success("Notifications activées sur cet appareil.");
      router.refresh();
    } catch (error) {
      toast.error(
        `Activation impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
    }
  };

  return (
    <section className="nc-card nc-content-enter overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3"
        aria-expanded={open}
      >
        <h2 className="text-[15px] font-semibold">Réglages</h2>
        <ChevronDown
          size={17}
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : undefined, color: "var(--color-text-muted)" }}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-5 border-t px-4 py-4" style={{ borderColor: "var(--color-border-default)" }}>
          <Block title="Compte LinkedIn" hint="Ses publications portent les commentaires reçus de l'inbox.">
            <div className="flex items-center gap-2">
              <input
                value={profileUrl}
                onChange={(event) => setProfileUrl(event.target.value)}
                placeholder="https://www.linkedin.com/in/…"
                className="nc-input"
              />
              <button
                type="button"
                onClick={saveProfile}
                disabled={pending || profileUrl.trim() === ""}
                className="nc-btn nc-btn--primary nc-btn--sm shrink-0"
              >
                OK
              </button>
            </div>
          </Block>

          <Block
            title="Plafonds journaliers"
            hint="Appliqués après le facteur de montée en charge."
          >
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Commentaires" value={caps.comments} onChange={(v) => setCaps({ ...caps, comments: v })} />
              <NumberField label="Likes" value={caps.likes} onChange={(v) => setCaps({ ...caps, likes: v })} />
              <NumberField label="Total" value={caps.total} onChange={(v) => setCaps({ ...caps, total: v })} />
            </div>
          </Block>

          <Block title="Cadence" hint="Délai aléatoire entre deux envois, et plafond horaire de commentaires.">
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Délai min (min)" value={delay.min} onChange={(v) => setDelay({ ...delay, min: v })} />
              <NumberField label="Délai max (min)" value={delay.max} onChange={(v) => setDelay({ ...delay, max: v })} />
              <NumberField label="Comm./heure" value={perHour} onChange={setPerHour} />
            </div>
          </Block>

          <Block title="Fenêtre d'émission" hint="Aucun envoi hors de ces plages.">
            <div className="flex items-center gap-2">
              <input value={start} onChange={(e) => setStart(e.target.value)} className="nc-input" placeholder="08:00" />
              <span style={{ color: "var(--color-text-muted)" }}>→</span>
              <input value={end} onChange={(e) => setEnd(e.target.value)} className="nc-input" placeholder="19:00" />
            </div>
            <div className="mt-2 flex gap-1.5">
              {DAY_LABELS.map((label, index) => {
                const active = days.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() =>
                      setDays(active ? days.filter((d) => d !== index) : [...days, index].sort())
                    }
                    className="h-9 w-9 rounded-full border text-[13px] font-medium"
                    style={{
                      borderColor: active ? "var(--color-brand)" : "var(--color-border-default)",
                      background: active ? "rgba(224,98,90,0.1)" : "transparent",
                      color: active ? "var(--color-brand)" : "var(--color-text-muted)",
                    }}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {policy.window.middayPause ? (
              <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                Creux méridien : {formatMinuteOfDay(policy.window.middayPause.startMinute)} –{" "}
                {formatMinuteOfDay(policy.window.middayPause.endMinute)}.
              </p>
            ) : null}
          </Block>

          <Block
            title="Fuseau horaire"
            hint="Référence des plafonds journaliers et de la fenêtre d'émission."
          >
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="nc-input"
              aria-label="Fuseau horaire"
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Block>

          <button type="button" onClick={savePolicy} disabled={pending} className="nc-btn nc-btn--primary">
            {pending ? "Enregistrement…" : "Enregistrer les réglages"}
          </button>

          <Block
            title="Récupération"
            hint="Profondeur des passages et garde-fous de coût. Chaque publication ou commentaire récupéré est facturé par le fournisseur."
          >
            <div className="grid grid-cols-2 gap-2">
              {NUMERIC_SYNC_SETTINGS.map((key) => {
                const bound = SYNC_SETTINGS_BOUNDS[key];
                return (
                  <NumberField
                    key={key}
                    label={`${bound.label} (${bound.unit})`}
                    value={sync[key]}
                    min={bound.min}
                    max={bound.max}
                    onChange={(value) => setSync({ ...sync, [key]: value })}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={saveSync}
              disabled={pending}
              className="nc-btn nc-btn--primary mt-3"
            >
              {pending ? "Enregistrement…" : "Enregistrer la récupération"}
            </button>
          </Block>

          <Block title="Process de génération" hint="Fichiers Markdown versionnés dans le dépôt.">
            <ul className="flex flex-col gap-1.5">
              {processes.map((entry) => (
                <li key={entry.kind} className="flex items-center gap-2 text-[13px]">
                  <FileText size={14} style={{ color: "var(--color-text-muted)" }} aria-hidden />
                  <code className="text-[12px]">{entry.file}</code>
                  <span className={`nc-badge ${entry.placeholder ? "nc-badge--brand" : "nc-badge--ok"}`}>
                    {entry.placeholder ? "à rédiger" : "rédigé"}
                  </span>
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="Notifications"
            hint={`${pushSubscriptions} appareil${pushSubscriptions > 1 ? "s" : ""} enregistré${pushSubscriptions > 1 ? "s" : ""}.`}
          >
            <button type="button" onClick={enablePush} className="nc-btn nc-btn--ghost nc-btn--sm">
              <Bell size={15} aria-hidden />
              Activer sur cet appareil
            </button>
          </Block>

          <Block title="Dernières actualisations" hint="Un échec laisse le curseur en place : rien n'est manqué.">
            <ul className="flex flex-col gap-1.5">
              {syncRuns.length === 0 ? (
                <li className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  Aucune actualisation.
                </li>
              ) : null}
              {syncRuns.map((run) => (
                <li key={run.id} className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                  <span className={`nc-badge ${run.ok ? "nc-badge--ok" : "nc-badge--alert"}`}>
                    {run.scope}
                  </span>{" "}
                  {relativeTime(run.startedAt)} · {run.postsInserted} pub. ·{" "}
                  {run.commentsInserted} comm.
                  {run.error ? (
                    <span className="block" style={{ color: "var(--color-brand)" }}>
                      {run.error.slice(0, 140)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Block>

          {failedCursors.length > 0 ? (
            <Block title="Sources en échec" hint="Elles seront réessayées à la prochaine actualisation.">
              <ul className="flex flex-col gap-1">
                {failedCursors.map((cursor) => (
                  <li key={cursor.key} className="flex items-start gap-1.5 text-[12px]" style={{ color: "var(--color-brand)" }}>
                    <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
                    <span className="break-all">
                      {cursor.key} — {cursor.failures} échec(s) : {cursor.error?.slice(0, 120)}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <form action={logout}>
            <button type="submit" className="nc-btn nc-btn--ghost nc-btn--sm">
              <LogOut size={15} aria-hidden />
              Se déconnecter
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold">{title}</p>
      {hint ? (
        <p className="mb-2 mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {hint}
        </p>
      ) : (
        <div className="mb-2" />
      )}
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          // Hors bornes, on laisse passer : le serveur renverra un message qui
          // nomme la borne, plutôt qu'un champ qui refuse la frappe en silence.
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
        className="nc-input"
        style={{ padding: "8px 10px" }}
      />
    </label>
  );
}

/**
 * La clé VAPID voyage en base64url ; `PushManager.subscribe` exige des octets
 * bruts. Sans cette conversion, l'abonnement échoue avec une erreur opaque.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
