"use client";

import { useState } from "react";

/**
 * transitions.dev · 27 — Toggle.
 *
 * `.is-init` n'est posé qu'à la première interaction : sans ça, l'interrupteur
 * joue son animation « off » au chargement de la page et donne l'impression
 * qu'on vient de le désactiver.
 */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const [touched, setTouched] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      data-on={on}
      onClick={() => {
        setTouched(true);
        onChange(!on);
      }}
      className={`t-toggle ${touched ? "is-init" : ""} relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full px-[3px] disabled:opacity-50`}
      style={{
        background: on ? "var(--color-brand)" : "var(--nc-switch-off-bg)",
        // La course par défaut du snippet (14,66 px) correspond à sa piste
        // d'exemple. Ici : 42 − 2×3 de marge − 18 de pouce = 18 px.
        ["--toggle-travel" as string]: "18px",
      } as React.CSSProperties}
    >
      <span
        className="t-toggle-thumb block h-[18px] w-[18px] rounded-full"
        style={{ background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
      />
    </button>
  );
}
