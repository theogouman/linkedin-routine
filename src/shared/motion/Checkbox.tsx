"use client";

/**
 * transitions.dev · 25 — Checkbox check.
 *
 * La case se remplit, puis le trait se dessine. `--check-len` est réglé sur la
 * longueur réelle du tracé, sinon la coche sur- ou sous-dessine et la fin de
 * l'animation se voit.
 *
 * `CheckboxMark` est la même case, muette : un `<span>` au lieu d'un
 * `<button>`. Elle sert quand la case vit DANS un élément déjà cliquable —
 * une ligne de menu, par exemple. Imbriquer deux boutons est invalide en HTML :
 * l'analyseur du navigateur sort le bouton intérieur, le DOM ne correspond
 * plus à ce que React a rendu côté serveur, et l'hydratation échoue.
 */
const PATH_LENGTH = 15;

const boxStyle = (checked: boolean): React.CSSProperties =>
  ({
    background: checked ? "var(--color-brand)" : "transparent",
    boxShadow: `inset 0 0 0 1.5px ${checked ? "var(--color-brand)" : "var(--color-border-default)"}`,
    color: "#fff",
    ["--check-len" as string]: String(PATH_LENGTH),
  }) as React.CSSProperties;

const BOX_CLASS =
  "t-check inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px]";

function Tick() {
  return (
    <svg width="11" height="11" viewBox="0 0 10.1668 10.1668" fill="none" aria-hidden>
      <path
        d="M1 5.52L3.92 9.17L9.17 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${BOX_CLASS} disabled:opacity-50`}
      style={boxStyle(checked)}
    >
      <Tick />
    </button>
  );
}

/** Même case, sans interaction : l'élément parent porte le clic et le rôle. */
export function CheckboxMark({ checked }: { checked: boolean }) {
  return (
    <span className={BOX_CLASS} style={boxStyle(checked)} aria-hidden>
      <Tick />
    </span>
  );
}
