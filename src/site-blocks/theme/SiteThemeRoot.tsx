import type { ReactNode } from 'react';
import { themeToCssVars, type SiteTheme } from './theme';

type Props = {
  theme: SiteTheme;
  children: ReactNode;
  className?: string;
};

/**
 * Scopes one tenant's theme to a subtree. Nesting two of these renders two
 * brands on one page, so the theme contract can be checked by laying one
 * theme over another site's content.
 */
export function SiteThemeRoot({ theme, children, className = '' }: Props) {
  const texture = theme.texture === 'none' ? '' : `site-texture-${theme.texture}`;

  return (
    <div
      style={themeToCssVars(theme)}
      className={`bg-[var(--site-paper)] text-[var(--site-ink)] font-[family-name:var(--site-font-body)] ${texture} ${className}`}
    >
      {children}
    </div>
  );
}
