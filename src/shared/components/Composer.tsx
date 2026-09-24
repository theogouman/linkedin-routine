"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import type { EnqueueActionResult, GenerateResult } from "@/app/actions";
import { scheduledLabel } from "@/shared/lib/format";
import { ErrorMessage, useShake } from "@/shared/motion/ShakeInput";
import { StreamingText } from "@/shared/motion/StreamingText";
import { ThinkingStates } from "@/shared/motion/ThinkingStates";

/**
 * transitions.dev · 28 — Thinking states.
 *
 * Trois états qui décrivent vraiment ce que fait la génération, au lieu d'un
 * « Génération… » figé. La ligne chatoie pendant qu'elle tient : l'app dit
 * qu'elle travaille encore, même quand l'appel dure dix secondes.
 */
const GENERATION_STATES = [
  "Lecture du process…",
  "Rédaction…",
  "Relecture…",
];

/**
 * Zone de rédaction partagée par le fil et l'inbox (FR-005, FR-006, FR-009).
 *
 * Deux règles portées ici et nulle part ailleurs :
 *
 *  1. Rien ne part sans validation manuelle. Le bouton « Générer » écrit dans
 *     le champ, jamais dans la file. C'est une contrainte de produit (FR-006),
 *     donc elle vit dans le composant, pas dans une convention d'usage.
 *  2. L'origine réellement enregistrée au journal dépend de ce que
 *     l'utilisateur a fait ensuite : une proposition publiée telle quelle et
 *     une proposition retravaillée ne sont pas la même chose (FR-016).
 */
export function Composer({
  placeholder,
  generateLabel,
  onGenerate,
  onSubmit,
  onDone,
}: {
  placeholder: string;
  generateLabel: string;
  onGenerate: () => Promise<GenerateResult>;
  onSubmit: (
    body: string,
    origin: "manual" | "ai_edited" | "ai_unchanged",
  ) => Promise<EnqueueActionResult>;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  // Aperçu en flux : le texte généré se pose mot à mot AVANT d'entrer dans le
  // champ. C'est le temps de commencer à le lire, donc de décider s'il part
  // (FR-006) au lieu de le publier par réflexe.
  const [streaming, setStreaming] = useState<string | null>(null);
  const shake = useShake();
  const [generating, startGenerating] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Le textarea grandit avec le contenu : sur téléphone, un champ d'une ligne
  // qui défile en interne rend la relecture impossible avant publication.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [value]);

  // Masque la barre de navigation pendant la saisie (cf. .nc-kb-open) : sur
  // iPhone, le clavier monte et la barre flottante recouvrirait le composer.
  useEffect(() => {
    return () => document.body.classList.remove("nc-kb-open");
  }, []);

  const generate = () => {
    startGenerating(async () => {
      const result = await onGenerate();
      if (!result.ok || !result.text) {
        toast.error(result.message ?? "Génération impossible.");
        return;
      }
      setGenerated(result.text);
      // Le texte n'entre pas encore dans le champ : il se pose d'abord dans
      // l'aperçu. Le remplir tout de suite afficherait la même proposition
      // deux fois, et donnerait l'impression que l'aperçu est un doublon.
      setStreaming(result.text);
      if (result.placeholderProcess) {
        toast.warning(
          "Le process de génération n'est pas encore rédigé : la proposition reste générique.",
        );
      }
    });
  };

  const submit = () => {
    const body = value.trim();
    if (body === "") {
      shake.shake("Le texte est vide.");
      return;
    }
    const origin =
      generated === null ? "manual" : generated.trim() === body ? "ai_unchanged" : "ai_edited";

    startSubmitting(async () => {
      const result = await onSubmit(body, origin);
      if (!result.ok) {
        toast.error(result.message ?? "Mise en file impossible.");
        return;
      }
      toast.success(
        result.deferred
          ? `Plafond du jour atteint — envoi reporté ${scheduledLabel(result.scheduledFor ?? "")}.`
          : `En file — envoi ${scheduledLabel(result.scheduledFor ?? "")}.`,
      );
      setValue("");
      setGenerated(null);
      setStreaming(null);
      onDone();
    });
  };

  return (
    <div className={shake.wrapClassName}>
      {streaming !== null ? (
        <div
          className="nc-input mb-2 whitespace-pre-wrap leading-[1.5]"
          style={{ fontSize: 15 }}
          aria-hidden
        >
          <StreamingText
            text={streaming}
            onDone={() => {
              setValue(streaming);
              setStreaming(null);
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          />
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setStreaming(null);
        }}
        onFocus={() => {
          document.body.classList.add("nc-kb-open");
          setStreaming(null);
        }}
        onBlur={() => document.body.classList.remove("nc-kb-open")}
        placeholder={placeholder}
        rows={2}
        className={`nc-input resize-none leading-[1.5] ${shake.inputClassName}`}
        disabled={submitting}
      />
      <ErrorMessage>{shake.error}</ErrorMessage>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={generating || submitting}
          className="nc-btn nc-btn--ghost nc-btn--sm"
        >
          <Sparkles size={15} aria-hidden />
          {generating ? <ThinkingStates states={GENERATION_STATES} /> : generateLabel}
        </button>

        <div className="flex-1" />

        <span className="text-[12px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          {value.trim().length}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || value.trim() === ""}
          className="nc-btn nc-btn--brand nc-btn--sm"
        >
          {submitting ? "Mise en file…" : "Publier"}
        </button>
      </div>

      <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Rien ne part immédiatement : l&apos;envoi passe par la file, à rythme humain.
      </p>
    </div>
  );
}
