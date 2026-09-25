"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Sparkles, PenLine } from "lucide-react";
import type {
  EnqueueActionResult,
  VarianteView,
  VariantsActionResult,
} from "@/app/actions";
import { SLOT_LABELS, type Slot } from "@/modules/ai/lib/comment-variants";
import type { VariantsStreamEvent } from "@/app/api/variants/route";
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
 *
 * Les propositions arrivent EN FLUX (route `/api/variants`) : chacune s'affiche
 * dès que le modèle l'a refermée, puis la liste finale, triée, remplace
 * l'ordre d'arrivée.
 */

export type GenerationTarget = { kind: "post" | "comment"; id: string };

/** Lit la route en flux et rejoue chaque évènement, ligne par ligne. */
async function streamVariants(
  target: GenerationTarget,
  onEvent: (event: VariantsStreamEvent) => void,
): Promise<void> {
  const response = await fetch("/api/variants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target: target.kind, id: target.id }),
  });
  if (!response.ok || !response.body) {
    onEvent({
      type: "error",
      message:
        response.status === 401 ? "Session expirée — reconnecte-toi." : "Génération impossible.",
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line !== "") onEvent(JSON.parse(line) as VariantsStreamEvent);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
}

const GENERATION_STATES = [
  "Lecture de tes commentaires…",
  "Rédaction des 4 variantes…",
  "Vérification…",
];

export function VariantComposer({
  placeholder,
  target,
  onSubmit,
  onDone,
}: {
  placeholder: string;
  target: GenerationTarget;
  onSubmit: (
    body: string,
    origin: "manual" | "ai_edited" | "ai_unchanged",
    from: { generationId: string | null; slot: Slot | null },
  ) => Promise<EnqueueActionResult>;
  onDone: () => void;
}) {
  const [result, setResult] = useState<VariantsActionResult | null>(null);
  /** Emplacement ouvert en édition, ou `manuel` pour le champ libre. */
  const [editing, setEditing] = useState<Slot | "manuel" | null>(null);
  const [value, setValue] = useState("");
  /** Texte d'origine de la carte ouverte, pour distinguer retouché de tel quel. */
  const [original, setOriginal] = useState("");

  const shake = useShake();
  const [generating, setGenerating] = useState(false);
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
    if (generating) return;
    setGenerating(true);
    setResult({ ok: true, variantes: [] });
    setEditing(null);
    setValue("");

    // Les variantes s'accumulent dans l'ordre d'arrivée ; seul `done` fixe la
    // liste définitive (triée, badgées reléguées) et l'identifiant de journal.
    const onEvent = (event: VariantsStreamEvent) => {
      if (event.type === "variante") {
        setResult((current) => ({
          ok: true,
          ...current,
          variantes: [
            ...(current?.variantes ?? []).filter((v) => v.slot !== event.variante.slot),
            event.variante,
          ],
        }));
      } else if (event.type === "retry") {
        setResult({ ok: true, variantes: [] });
        setEditing(null);
        setValue("");
      } else if (event.type === "done") {
        const outcome = event.result;
        setResult(outcome);
        if (outcome.postExploitable === false) {
          toast.message(
            "Post trop pauvre pour réagir à un point précis : seules la réaction et la vanne sont proposées.",
          );
        }
        if (outcome.thematiqueManquant) {
          toast.message("Exemple thématique absent de cette génération.");
        }
        if (outcome.cacheWarning) {
          toast.warning("Cache non lu sur cet appel : quelque chose de variable est passé en system.");
        }
      } else {
        setResult(null);
        setEditing(null);
        toast.error(event.message);
      }
    };

    streamVariants(target, onEvent)
      .catch(() => {
        setResult(null);
        toast.error("Connexion interrompue pendant la génération.");
      })
      .finally(() => setGenerating(false));
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
            className="nc-btn nc-btn--inset nc-btn--sm"
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
            className="nc-btn nc-btn--inset nc-btn--sm"
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
