"use client";

import { CheckboxMark } from "@/shared/motion/Checkbox";

/**
 * Corps d'un menu de sélection de listes, à cases à cocher.
 *
 * Partagé par le filtre du feed et par « Changer de liste » d'une carte : ce
 * sont deux gestes différents sur la même matière, et deux implémentations
 * finiraient par diverger sur l'ordre ou sur le libellé.
 *
 * La ligne entière est le bouton, et la case n'est qu'un dessin : imbriquer un
 * `<button>` dans un `<button>` est invalide, le navigateur sort le bouton
 * intérieur du parent, et l'hydratation échoue sur la différence.
 */
export function ListPickerMenu({
  lists,
  selected,
  onToggle,
  footer,
  emptyLabel = "Aucune liste.",
}: {
  lists: Array<{ id: string; name: string; count?: number }>;
  selected: string[];
  onToggle: (id: string, next: boolean) => void;
  footer?: React.ReactNode;
  emptyLabel?: string;
}) {
  if (lists.length === 0) {
    return (
      <p className="px-3 py-2.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      {/* Défilement interne plafonné : avec huit listes le menu tient, mais il
          ne doit pas pousser sous la barre de navigation quand il y en aura
          trente. */}
      <div className="max-h-[min(52vh,380px)] overflow-y-auto">
        {lists.map((list) => {
          const checked = selected.includes(list.id);
          return (
            <button
              key={list.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              className="nc-menu-item w-full"
              onClick={() => onToggle(list.id, !checked)}
            >
              <CheckboxMark checked={checked} />
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
              {list.count !== undefined ? (
                <span className="tabular-nums text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {list.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {footer ? (
        <div className="mt-1 border-t pt-1" style={{ borderColor: "var(--color-border-default)" }}>
          {footer}
        </div>
      ) : null}
    </>
  );
}
