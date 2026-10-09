import type { SiteSettings } from './types';

export function SiteHeader({ settings }: { settings: SiteSettings }) {
  return (
    <header className="border-b border-[var(--site-line)] px-6 sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-4 py-5">
        <div className="flex items-baseline gap-3">
          {/* A plain link, as the menu's are, so this header has no Next.js import and the admin's
              Appearance preview can draw it from an exact copy (D-030). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above: a full load of the home page is fine */}
          <a
            href="/"
            className="font-[family-name:var(--site-font-display)] text-lg font-semibold tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"
          >
            {settings.name}
          </a>
          {settings.tagline ? (
            <span className="font-[family-name:var(--site-font-utility)] text-[0.6875rem] uppercase tracking-[0.16em] text-[var(--site-muted)]">
              {settings.tagline}
            </span>
          ) : null}
        </div>

        <nav aria-label={`${settings.name} navigation`}>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 font-[family-name:var(--site-font-utility)] text-sm">
            {settings.nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-[var(--site-muted)] outline-none transition-colors hover:text-[var(--site-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
