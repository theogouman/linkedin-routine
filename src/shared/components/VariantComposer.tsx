"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Sparkles, PenLine } from "lucide-react";
import type {
  EnqueueActionResult,
  VarianteView,
  VariantsActionResult,
} from "@/app/actions";
import {
  INTENTIONS,
  INTENTION_LABELS,
  SLOT_LABELS,
  type Intention,
  type Slot,
} from "@/modules/ai/lib/comment-variants";
import { scheduledLabel } from "@/shared/lib/format";
import { ErrorMessage, useShake } from "@/shared/motion/ShakeInput";
import { ThinkingStates } from "@/shared/motion/ThinkingStates";

/**
 * Quatre propositions, un choix, une publication manuelle.
 *
 * Remplace le composer à proposition unique pour les commentaires et les
 * réponses. La différence n'est pas d'avoir quatre textes au lieu d'un : c'est
 * que les quatre couvrent des registres FIXES et différents — une question,
 * une réaction courte, un avis, une vanne ou un bravo. Théo ne choisit pas la
 * meilleure formulation d'une idée, il choisit ce qu'il pense vraiment.
 *
 * Deux règles portées ici et nulle part ailleurs :
 *
 *  1. **Rien ne part sans validation manuelle** (FR-006). Une carte touchée
 *     s'ouvre en édition ; seul « Publier » met en file.
 *  2. **Une carte badgée est reléguée, jamais masquée.** Le serveur les a déjà
 *     triées. Les cacher obligerait à régénérer — donc à repayer un appel —
 *     pour un défaut que l'œil corrige en deux secondes.
 */

const GENERATION_STATES = [
  "Lecture de tes commentaires…",
  "Rédaction des 4 variantes…",
  "Vérification…",
];

export function VariantComposer({
  placeholder,
  onGenerate,
  onSubmit,
  onDone,
}: {
  placeholder: string;
  onGenerate: (intention: Intention | null) => Promise<VariantsActionResult>;
  onSubmit: (
    body: string,
    origin: "manual" | "ai_edited" | "ai_unchanged",
    from: { generationId: string | null; slot: Slot | null },
  ) => Promise<EnqueueActionResult>;
  onDone: () => void;
}) {
  const [intention, setIntention] = useState<Intention | null>(null);
  const [result, setResult] = useState<VariantsActionResult | null>(null);
  /** Emplacement ouvert en édition, ou `manuel` pour le champ libre. */
  const [editing, setEditing] = useState<Slot | "manuel" | null>(null);
  const [value, setValue] = useState("");
  /** Texte d'origine de la carte ouverte, pour distinguer retouché de tel quel. */
  const [original, setOriginal] = useState("");

  const shake = useShake();
  const [generating, startGenerating] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Le champ grandit avec le contenu : sur téléphone, un champ d'une ligne qui
  // défile en interne rend la relecture impossible avant publication.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [value, editing]);

  useEffect(() => {
    return () => document.body.classList.remove("nc-kb-open");
  }, []);

  const generate = () => {
    startGenerating(async () => {
      const outcome = await onGenerate(intention);
      if (!outcome.ok) {
        toast.error(outcome.message ?? "Génération impossible.");
        return;
      }
      setResult(outcome);
      setEditing(null);
      setValue("");
      if (outcome.postExploitable === false) {
        toast.message(
          "Post trop pauvre pour réagir à un point précis : seules la réaction et la vanne sont proposées.",
        );
      }
      if (outcome.thematiqueManquant) {
        toast.message("Exemple thématique absent — les embeddings ne sont pas encore calculés.");
      }
      if (outcome.cacheWarning) {
        toast.warning("Cache non lu sur cet appel : quelque chose de variable est passé en system.");
      }
    });
  };

  const open = (variante: VarianteView) => {
    setEditing(variante.slot);
    setValue(variante.texte);
    setOriginal(variante.texte);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const openManual = () => {
    setEditing("manuel");
    setValue("");
    setOriginal("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = () => {
    const body = value.trim();
    if (body === "") {
      shake.shake("Le texte est vide.");
      return;
    }
    const origin =
      editing === "manuel" || original === ""
        ? "manual"
        : original.trim() === body
          ? "ai_unchanged"
          : "ai_edited";

    startSubmitting(async () => {
      const outcome = await onSubmit(body, origin, {
        generationId: editing === "manuel" ? null : result?.generationId ?? null,
        slot: editing === "manuel" || editing === null ? null : editing,
      });
      if (!outcome.ok) {
        toast.error(outcome.message ?? "Mise en file impossible.");
        return;
      }
      toast.success(
        outcome.deferred
          ? `Plafond du jour atteint — envoi reporté ${scheduledLabel(outcome.scheduledFor ?? "")}.`
          : `En file — envoi ${scheduledLabel(outcome.scheduledFor ?? "")}.`,
      );
      setValue("");
      setResult(null);
      setEditing(null);
      onDone();
    });
  };

  const variantes = result?.variantes ?? [];

  return (
    <div className={shake.wrapClassName}>
      {/* Sélecteur d'intention : facultatif, un tap, et il survit à la
          génération pour qu'une régénération garde la même orientation. */}
      {variantes.length === 0 && editing === null ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {INTENTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setIntention((current) => (current === value ? null : value))}
              aria-pressed={intention === value}
              className="nc-btn nc-btn--surface nc-btn--sm"
              data-active={intention === value}
            >
              {INTENTION_LABELS[value]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Les propositions. Celle qu'on touche s'ouvre en place. */}
      <div className="flex flex-col gap-2">
        {variantes.map((variante) =>
          editing === variante.slot ? (
            <Editor
              key={variante.slot}
              label={SLOT_LABELS[variante.slot]}
              value={value}
              onChange={setValue}
              onCancel={() => {
                setEditing(null);
                setValue("");
              }}
              onSubmit={submit}
              submitting={submitting}
              textareaRef={textareaRef}
              shakeClassName={shake.inputClassName}
              placeholder={placeholder}
            />
          ) : (
            <VarianteCard
              key={variante.slot}
              variante={variante}
              dimmed={editing !== null}
              onOpen={() => open(variante)}
            />
          ),
        )}
      </div>

      {editing === "manuel" ? (
        <Editor
          label="À la main"
          value={value}
          onChange={setValue}
          onCancel={() => {
            setEditing(null);
            setValue("");
          }}
          onSubmit={submit}
          submitting={submitting}
          textareaRef={textareaRef}
          shakeClassName={shake.inputClassName}
          placeholder={placeholder}
        />
      ) : null}

      <ErrorMessage>{shake.error}</ErrorMessage>

      {editing === null ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating || submitting}
            className="nc-btn nc-btn--ghost nc-btn--sm"
          >
            {variantes.length === 0 ? (
              <Sparkles size={15} aria-hidden />
            ) : (
              <RefreshCw size={15} aria-hidden />
            )}
            {generating ? (
              <ThinkingStates states={GENERATION_STATES} />
            ) : variantes.length === 0 ? (
              "4 propositions"
            ) : (
              "Régénérer"
            )}
          </button>

          <button
            type="button"
            onClick={openManual}
            disabled={generating || submitting}
            className="nc-btn nc-btn--ghost nc-btn--sm"
          >
            <PenLine size={15} aria-hidden />
            Écrire à la main
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VarianteCard({
  variante,
  dimmed,
  onOpen,
}: {
  variante: VarianteView;
  dimmed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="nc-variant nc-content-enter"
      data-badged={variante.badges.length > 0}
      style={dimmed ? { opacity: 0.45 } : undefined}
    >
      <span className="nc-variant-head">
        <span className="nc-variant-slot">{SLOT_LABELS[variante.slot]}</span>
        {variante.badges.map((badge) => (
          <span key={badge.kind} className="nc-variant-badge" title={badge.detail}>
            {badge.label}
          </span>
        ))}
      </span>
      <span className="nc-variant-text">{variante.texte}</span>
    </button>
  );
}

function Editor({
  label,
  value,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  textareaRef,
  shakeClassName,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  shakeClassName: string;
  placeholder: string;
}) {
  return (
    <div className="nc-variant nc-variant--editing">
      <span className="nc-variant-head">
        <span className="nc-variant-slot">{label}</span>
      </span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => document.body.classList.add("nc-kb-open")}
        onBlur={() => document.body.classList.remove("nc-kb-open")}
        placeholder={placeholder}
        rows={2}
        className={`nc-input resize-none leading-[1.5] ${shakeClassName}`}
        disabled={submitting}
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={onCancel} className="nc-btn nc-btn--ghost nc-btn--sm">
          Annuler
        </button>
        <div className="flex-1" />
        <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {value.trim().length}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || value.trim() === ""}
          className="nc-btn nc-btn--brand nc-btn--sm"
        >
          {submitting ? "Mise en file…" : "Publier"}
        </button>
      </div>
    </div>
  );
}
