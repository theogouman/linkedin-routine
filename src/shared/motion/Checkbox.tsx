"use client";

/**
 * transitions.dev · 25 — Checkbox check.
 *
 * La case se remplit, puis le trait se dessine. `--check-len` est réglé sur la
 * longueur réelle du tracé, sinon la coche sur- ou sous-dessine et la fin de
 * l'animation se voit.
 */
const PATH_LENGTH = 15;

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
      className="t-check inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] disabled:opacity-50"
      style={{
        background: checked ? "var(--color-brand)" : "transparent",
        boxShadow: `inset 0 0 0 1.5px ${checked ? "var(--color-brand)" : "var(--color-border-default)"}`,
        color: "#fff",
        ["--check-len" as string]: String(PATH_LENGTH),
      } as React.CSSProperties}
    >
      <svg width="11" height="11" viewBox="0 0 10.1668 10.1668" fill="none" aria-hidden>
        <path
          d="M1 5.52L3.92 9.17L9.17 1"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
