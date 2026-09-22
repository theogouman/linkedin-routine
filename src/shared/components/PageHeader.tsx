import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="nc-content-enter mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
