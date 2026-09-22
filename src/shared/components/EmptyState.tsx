import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="nc-card nc-content-enter px-6 py-10 text-center">
      <p className="text-base font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
