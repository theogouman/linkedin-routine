"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Bell, Check, FileText, LogOut } from "lucide-react";
import {
  saveGenerationSettingsAction,
  savePolicyAction,
  setSelfProfileAction,
} from "@/app/actions";
import { EFFORTS, MODEL_CHOICES, type Effort, type GenerationSettings } from "@/modules/ai/lib/model";
import { logout } from "@/modules/auth/server/actions";
import { formatMinuteOfDay, parseMinuteOfDay, relativeTime } from "@/shared/lib/format";
import { Accordion } from "@/shared/motion/Accordion";
import { Checkbox, CheckboxMark } from "@/shared/motion/Checkbox";
import { ClearableInput } from "@/shared/motion/ClearableInput";
import { IconSwap } from "@/shared/motion/IconSwap";
import { SuccessCheck } from "@/shared/motion/SuccessCheck";
import { ErrorMessage, useShake } from "@/shared/motion/ShakeInput";
import { Toggle } from "@/shared/motion/Toggle";

/**
 * Réglages : plafonds, fenêtre, compte, process IA, notifications, diagnostics.
 *
 * Chaque groupe est un accordéon (transitions.dev · 21) replié par défaut,
 * sauf le premier. Ce sont des réglages qu'on touche une fois puis plus
 * jamais ; tout déplier ferait de la page un mur.
 */

const DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

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

type Section =
  | "compte"
  | "rythme"
  | "fenetre"
  | "modele"
  | "process"
  | "notifications"
  | "diagnostics";

export function SettingsForm({
  policy,
  selfProfileUrl,
  processes,
  generation,
  vapidPublicKey,
  pushSubscriptions,
  syncRuns,
  failedCursors,
}: {
  policy: PolicyView;
  selfProfileUrl: string | null;
  processes: Array<{ kind: string; file: string; placeholder: boolean }>;
  generation: GenerationSettings;
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
    remaining: number;
    accountsSynced: number;
    error: string | null;
  }>;
  failedCursors: Array<{ key: string; failures: number; error: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Section | null>("compte");
  const [saved, setSaved] = useState(false);

  const [caps, setCaps] = useState(policy.caps);
  const [delay, setDelay] = useState(policy.delayMinutes);
  const [perHour, setPerHour] = useState(policy.maxCommentsPerHour);
  const [days, setDays] = useState(policy.window.days);
  const [start, setStart] = useState(formatMinuteOfDay(policy.window.startMinute));
  const [end, setEnd] = useState(formatMinuteOfDay(policy.window.endMinute));
  const [profileUrl, setProfileUrl] = useState(selfProfileUrl ?? "");
  const [pushOn, setPushOn] = useState(pushSubscriptions > 0);
  const [model, setModel] = useState(generation.model);
  const [effort, setEffort] = useState<Effort>(generation.effort);
  const [modelSaved, setModelSaved] = useState(false);

  const windowShake = useShake();
  const profileShake = useShake();

  const toggle = (section: Section) => setOpen((current) => (current === section ? null : section));

  const savePolicy = () => {
    const startMinute = parseMinuteOfDay(start);
    const endMinute = parseMinuteOfDay(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      // transitions.dev · 12 — la secousse remplace le toast : l'erreur porte
      // sur CE champ, elle doit se voir là où on la corrige.
      setOpen("fenetre");
      windowShake.shake("Format HH:MM, et la fin doit suivre le début.");
      return;
    }
    startTransition(async () => {
      const result = await savePolicyAction({
        caps,
        delayMinutes: delay,
        maxCommentsPerHour: perHour,
        window: { days, startMinute, endMinute, middayPause: policy.window.middayPause },
      });
      if (!result.ok) {
        toast.error(result.message ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      router.refresh();
    });
  };

  const saveProfile = () => {
    startTransition(async () => {
      const result = await setSelfProfileAction(profileUrl);
      if (!result.ok) {
        profileShake.shake(result.message ?? "URL de profil LinkedIn invalide.");
        return;
      }
      toast.success("Compte enregistré. Actualise pour récupérer tes publications.");
      router.refresh();
    });
  };

  const saveGeneration = () => {
    startTransition(async () => {
      const result = await saveGenerationSettingsAction({ model, effort });
      if (!result.ok) {
        toast.error(result.message ?? "Enregistrement impossible.");
        return;
      }
      setModelSaved(true);
      window.setTimeout(() => setModelSaved(false), 2200);
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
      setPushOn(true);
      toast.success("Notifications activées sur cet appareil.");
      router.refresh();
    } catch (error) {
      setPushOn(false);
      toast.error(
        `Activation impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "compte"}
        onToggle={() => toggle("compte")}
        title="Compte LinkedIn"
        meta={selfProfileUrl ?? "Non renseigné"}
      >
        <div className="px-4 pb-4">
          <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Ses publications portent les commentaires reçus de l&apos;inbox.
          </p>
          <div className={profileShake.wrapClassName}>
            <div className="flex items-center gap-2">
              <ClearableInput
                value={profileUrl}
                onChange={setProfileUrl}
                onEnter={saveProfile}
                placeholder="https://www.linkedin.com/in/…"
                className={profileShake.inputClassName}
                inputMode="url"
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
            <ErrorMessage>{profileShake.error}</ErrorMessage>
          </div>
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "rythme"}
        onToggle={() => toggle("rythme")}
        title="Plafonds et cadence"
        meta={`${caps.comments} commentaires · ${caps.likes} likes · ${caps.total} au total par jour`}
      >
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div>
            <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Appliqués après le facteur de montée en charge.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Commentaires" value={caps.comments} onChange={(v) => setCaps({ ...caps, comments: v })} />
              <NumberField label="Likes" value={caps.likes} onChange={(v) => setCaps({ ...caps, likes: v })} />
              <NumberField label="Total" value={caps.total} onChange={(v) => setCaps({ ...caps, total: v })} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Délai aléatoire entre deux envois, et plafond horaire de commentaires.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Délai min (min)" value={delay.min} onChange={(v) => setDelay({ ...delay, min: v })} />
              <NumberField label="Délai max (min)" value={delay.max} onChange={(v) => setDelay({ ...delay, max: v })} />
              <NumberField label="Comm./heure" value={perHour} onChange={setPerHour} />
            </div>
          </div>
          <SaveButton pending={pending} saved={saved} onClick={savePolicy} />
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "fenetre"}
        onToggle={() => toggle("fenetre")}
        title="Fenêtre d'émission"
        meta={`${start} → ${end} · ${days.length} jour${days.length > 1 ? "s" : ""}`}
      >
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Aucun envoi hors de ces plages.
          </p>
          <div className={windowShake.wrapClassName}>
            <div className="flex items-center gap-2">
              <input
                value={start}
                onChange={(event) => setStart(event.target.value)}
                className={`nc-input ${windowShake.inputClassName}`}
                placeholder="08:00"
                aria-label="Début de la fenêtre"
              />
              <span style={{ color: "var(--color-text-muted)" }}>→</span>
              <input
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                className={`nc-input ${windowShake.inputClassName}`}
                placeholder="19:00"
                aria-label="Fin de la fenêtre"
              />
            </div>
            <ErrorMessage>{windowShake.error}</ErrorMessage>
          </div>

          <ul className="flex flex-col gap-1.5">
            {DAY_LABELS.map((label, index) => (
              <li key={index} className="flex items-center gap-2.5">
                <Checkbox
                  checked={days.includes(index)}
                  label={label}
                  onChange={(next) =>
                    setDays(next ? [...days, index].sort() : days.filter((day) => day !== index))
                  }
                />
                <span className="text-[13px]">{label}</span>
              </li>
            ))}
          </ul>

          {policy.window.middayPause ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Creux méridien : {formatMinuteOfDay(policy.window.middayPause.startMinute)} –{" "}
              {formatMinuteOfDay(policy.window.middayPause.endMinute)}.
            </p>
          ) : null}

          <SaveButton pending={pending} saved={saved} onClick={savePolicy} />
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "modele"}
        onToggle={() => toggle("modele")}
        title="Modèle de génération"
        meta={`${MODEL_CHOICES.find((entry) => entry.id === model)?.label ?? model} · effort ${effort}`}
      >
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Rédiger cinquante mots selon un process fourni est de la mise en forme
            contrainte, pas du raisonnement : Haiku suffit, et coûte quelques centimes
            par mois au volume cible.
          </p>

          <ul className="flex flex-col gap-1.5">
            {MODEL_CHOICES.map((choice) => {
              const active = model === choice.id;
              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    onClick={() => setModel(choice.id)}
                    aria-pressed={active}
                    className="flex w-full items-start gap-2.5 rounded-[12px] border p-3 text-left"
                    style={{
                      borderColor: active
                        ? "rgba(224, 98, 90, 0.45)"
                        : "var(--color-border-default)",
                      background: active ? "rgba(224, 98, 90, 0.06)" : "transparent",
                    }}
                  >
                    <CheckboxMark checked={active} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{choice.label}</span>
                      <span
                        className="mt-0.5 block text-[12px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {choice.hint}
                      </span>
                      <code className="mt-1 block text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {choice.id}
                      </code>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Le modèle courant peut venir d'`ANTHROPIC_MODEL` et sortir de la
              liste : on le montre plutôt que de faire croire à un choix qui
              n'est pas celui qui sert. */}
          {MODEL_CHOICES.every((choice) => choice.id !== model) ? (
            <p className="text-[12px]" style={{ color: "var(--color-brand)" }}>
              Modèle hors liste, défini ailleurs : <code>{model}</code>. Choisir
              ci-dessus le remplacera.
            </p>
          ) : null}

          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Effort</p>
            <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Transmis uniquement aux modèles de la famille Claude 5. Sans effet sur
              Haiku, qui ne connaît pas ce paramètre.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EFFORTS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEffort(level)}
                  aria-pressed={effort === level}
                  className="nc-btn nc-btn--surface nc-btn--sm"
                  data-active={effort === level}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <SaveButton pending={pending} saved={modelSaved} onClick={saveGeneration} />
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "process"}
        onToggle={() => toggle("process")}
        title="Process de génération"
        meta={
          processes.every((entry) => !entry.placeholder)
            ? "Rédigés"
            : `${processes.filter((entry) => entry.placeholder).length} à rédiger`
        }
      >
        <div className="px-4 pb-4">
          <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            Fichiers Markdown versionnés dans le dépôt.
          </p>
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
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "notifications"}
        onToggle={() => toggle("notifications")}
        title="Notifications"
        meta={`${pushSubscriptions} appareil${pushSubscriptions > 1 ? "s" : ""} enregistré${pushSubscriptions > 1 ? "s" : ""}`}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Activer sur cet appareil</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Un rappel quotidien quand il reste des publications à traiter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Bell size={15} style={{ color: "var(--color-text-muted)" }} aria-hidden />
            <Toggle
              on={pushOn}
              label="Notifications sur cet appareil"
              onChange={(next) => {
                if (next) void enablePush();
                else
                  toast.message(
                    "Le retrait se fait depuis les réglages du navigateur ou du système.",
                  );
              }}
            />
          </div>
        </div>
      </Accordion>

      <Accordion
        className="nc-card nc-content-enter overflow-hidden"
        open={open === "diagnostics"}
        onToggle={() => toggle("diagnostics")}
        title="Diagnostics"
        meta={
          failedCursors.length > 0
            ? `${failedCursors.length} source${failedCursors.length > 1 ? "s" : ""} en échec`
            : "Dernières actualisations"
        }
      >
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div>
            <p className="mb-1.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Un échec laisse le curseur en place : rien n&apos;est manqué.
            </p>
            <ul className="flex flex-col gap-1.5">
              {syncRuns.length === 0 ? (
                <li className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  Aucune actualisation.
                </li>
              ) : null}
              {syncRuns.map((run) => {
                // Trois états, pas deux. `ok = null` ne veut pas dire échec :
                // il veut dire que le passage ne s'est jamais terminé — la
                // fonction a été arrêtée. Les afficher en rouge comme des
                // échecs cachait la vraie nature du problème.
                const state =
                  run.finishedAt === null
                    ? { label: "interrompue", className: "nc-badge--neutral" }
                    : run.ok
                      ? { label: run.scope, className: "nc-badge--ok" }
                      : { label: "échec", className: "nc-badge--alert" };
                return (
                  <li key={run.id} className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    <span className={`nc-badge ${state.className}`}>{state.label}</span>{" "}
                    {relativeTime(run.startedAt)} · {run.accountsSynced} compte
                    {run.accountsSynced > 1 ? "s" : ""} · {run.postsInserted} pub. ·{" "}
                    {run.commentsInserted} comm.
                    {run.remaining > 0 ? (
                      <span className="block" style={{ color: "var(--color-text-muted)" }}>
                        {run.remaining} compte{run.remaining > 1 ? "s" : ""} restant
                        {run.remaining > 1 ? "s" : ""} — relance pour continuer.
                      </span>
                    ) : null}
                    {run.error ? (
                      <span className="block" style={{ color: "var(--color-brand)" }}>
                        {run.error.slice(0, 140)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {failedCursors.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {failedCursors.map((cursor) => (
                <li
                  key={cursor.key}
                  className="flex items-start gap-1.5 text-[12px]"
                  style={{ color: "var(--color-brand)" }}
                >
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="break-all">
                    {cursor.key} — {cursor.failures} échec(s) : {cursor.error?.slice(0, 120)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Accordion>

      <form action={logout} className="nc-content-enter mt-1">
        <button type="submit" className="nc-btn nc-btn--ghost nc-btn--sm">
          <LogOut size={15} aria-hidden />
          Se déconnecter
        </button>
      </form>
    </div>
  );
}

/**
 * transitions.dev · 09 (Icon swap) + 10 (Success check).
 *
 * Le bouton ne change pas de taille entre « Enregistrer » et « Enregistré » :
 * les deux icônes partagent la même cellule de grille. La coche se dessine —
 * c'est la seule confirmation, il n'y a pas de toast en plus.
 */
function SaveButton({
  pending,
  saved,
  onClick,
}: {
  pending: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={pending} className="nc-btn nc-btn--primary self-start">
      <IconSwap
        state={saved ? "b" : "a"}
        a={<Check size={15} aria-hidden style={{ opacity: 0 }} />}
        b={<SuccessCheck shown={saved} size={15} />}
      />
      {pending ? "Enregistrement…" : saved ? "Enregistré" : "Enregistrer"}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={value}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
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
