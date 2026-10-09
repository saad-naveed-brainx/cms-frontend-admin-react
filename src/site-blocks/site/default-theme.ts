import type { SiteTheme } from '@/theme/theme';

/**
 * What a site looks like until it has a theme of its own, and for any part of a stored theme that
 * is missing or not valid. A new site is created with an empty theme (`{}`), so this is what every
 * new site shows. Plain on purpose: it must read well under any content.
 */
export const DEFAULT_THEME: SiteTheme = {
  typeSet: 'editorial',
  shape: 'soft',
  density: 'comfortable',
  texture: 'none',
  palette: {
    paper: '#ffffff',
    surface: '#f6f6f4',
    ink: '#16181a',
    muted: '#5f6368',
    line: '#d9dad6',
    brand: '#1f4fd8',
    onBrand: '#ffffff',
    accent: '#b45309',
  },
};
