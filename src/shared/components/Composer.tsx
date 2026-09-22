"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import type { EnqueueActionResult, GenerateResult } from "@/app/actions";
import { scheduledLabel } from "@/shared/lib/format";

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
      setValue(result.text);
      setGenerated(result.text);
      if (result.placeholderProcess) {
        toast.warning(
          "Le process de génération n'est pas encore rédigé : la proposition reste générique.",
        );
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    });
  };

  const submit = () => {
    const body = value.trim();
    if (body === "") {
      toast.error("Le texte est vide.");
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
      onDone();
    });
  };

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => document.body.classList.add("nc-kb-open")}
        onBlur={() => document.body.classList.remove("nc-kb-open")}
        placeholder={placeholder}
        rows={2}
        className="nc-input resize-none leading-[1.5]"
        disabled={submitting}
      />

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={generating || submitting}
          className="nc-btn nc-btn--ghost nc-btn--sm"
        >
          <Sparkles size={15} aria-hidden />
          {generating ? (
            <span className="t-shimmer" data-text="Génération…">
              Génération…
            </span>
          ) : (
            generateLabel
          )}
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
