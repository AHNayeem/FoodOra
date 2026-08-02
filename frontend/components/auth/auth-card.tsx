import * as React from "react";

/** AuthCard — titled panel wrapping every auth form for a consistent shell. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="mb-6 text-center lg:text-start">
        <h1 className="text-h1 text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-body">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 text-center text-sm text-body">{footer}</div>}
    </div>
  );
}

/** Labelled horizontal rule used between social buttons and the form. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
