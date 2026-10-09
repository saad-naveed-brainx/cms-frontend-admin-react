import type { SiteSettings } from './types';

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  return (
    <footer className="border-t border-[var(--site-line)] bg-[var(--site-surface)] px-6 sm:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-10 py-12 sm:grid-cols-[1.2fr_repeat(2,0.9fr)]">
        <div className="flex flex-col gap-3">
          <span className="font-[family-name:var(--site-font-display)] text-lg font-semibold">{settings.name}</span>
          {settings.footer.note ? (
            <p className="max-w-xs text-sm leading-relaxed text-[var(--site-muted)]">{settings.footer.note}</p>
          ) : null}
        </div>

        {settings.footer.groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--site-font-utility)] text-[0.6875rem] uppercase tracking-[0.16em] text-[var(--site-muted)]">
              {group.title}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {group.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[var(--site-muted)] outline-none transition-colors hover:text-[var(--site-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto w-full max-w-6xl border-t border-[var(--site-line)] py-5">
        <p className="font-[family-name:var(--site-font-utility)] text-xs tracking-[0.08em] text-[var(--site-muted)]">
          {settings.host}
        </p>
      </div>
    </footer>
  );
}
