import type { ReactNode } from 'react';
import type { LinkRef } from './types';

/** Vertical rhythm and the page gutter, both driven by the site's density. */
export function Section({
  children,
  className = '',
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <section className={`px-6 sm:px-10 ${bleed ? '' : 'py-[var(--site-section-y)]'} ${className}`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/** Small tracked label. Utility face, so it changes character per tenant. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-[family-name:var(--site-font-utility)] text-[0.6875rem] uppercase tracking-[0.18em] text-[var(--site-muted)]">
      {children}
    </p>
  );
}

export function Heading({
  children,
  level = 2,
  className = '',
}: {
  children: ReactNode;
  level?: 1 | 2 | 3;
  className?: string;
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const size =
    level === 1
      ? 'text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.02]'
      : level === 2
        ? 'text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.08]'
        : 'text-[1.125rem] leading-[1.3]';

  return (
    <Tag
      className={`font-[family-name:var(--site-font-display)] font-semibold tracking-[-0.015em] text-balance ${size} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Prose({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`max-w-[var(--site-measure)] text-[1.0625rem] leading-[1.6] text-[var(--site-muted)] ${className}`}>
      {children}
    </p>
  );
}

const focus =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]';

export function ActionLink({ action, variant }: { action: LinkRef; variant: 'primary' | 'secondary' }) {
  if (variant === 'primary') {
    return (
      <a
        href={action.href}
        className={`inline-flex items-center gap-2 rounded-[var(--site-radius-pill)] bg-[var(--site-brand)] px-6 py-3 font-[family-name:var(--site-font-utility)] text-sm font-semibold tracking-[0.02em] text-[var(--site-on-brand)] transition-transform hover:-translate-y-px ${focus}`}
      >
        {action.label}
      </a>
    );
  }

  return (
    <a
      href={action.href}
      className={`inline-flex items-center gap-2 border-b border-[var(--site-line)] pb-1 font-[family-name:var(--site-font-utility)] text-sm font-semibold tracking-[0.02em] text-[var(--site-ink)] transition-colors hover:border-[var(--site-accent)] ${focus}`}
    >
      {action.label}
      <span aria-hidden="true">&rarr;</span>
    </a>
  );
}
