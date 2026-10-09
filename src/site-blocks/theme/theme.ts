import type { CSSProperties } from 'react';

/**
 * A site's visual identity, stored per tenant as `theme_json`.
 *
 * Tenants pick from fixed palettes of type sets and shapes rather than
 * supplying arbitrary fonts or CSS — the same reasoning as the fixed palette of
 * field kinds in the content-type builder. It keeps rendering predictable and
 * keeps a tenant from being able to break its own site.
 */
export type SiteTheme = {
  typeSet: TypeSetName;
  shape: ShapeName;
  density: DensityName;
  texture: TextureName;
  palette: Palette;
};

export type TypeSetName = 'editorial' | 'technical';
export type ShapeName = 'soft' | 'sharp';
export type DensityName = 'comfortable' | 'tight';
export type TextureName = 'none' | 'grain' | 'grid';

export type Palette = {
  /** Page background. */
  paper: string;
  /** Raised panels sitting on the page background. */
  surface: string;
  /** Primary text. */
  ink: string;
  /** Secondary text: captions, metadata, supporting copy. */
  muted: string;
  /** Hairlines and dividers. */
  line: string;
  /** Primary brand colour, used for solid actions. */
  brand: string;
  /** Text placed on top of `brand`. */
  onBrand: string;
  /** Second brand colour, used sparingly for emphasis and data. */
  accent: string;
};

const TYPE_SETS: Record<TypeSetName, { display: string; body: string; utility: string }> = {
  editorial: {
    display: 'var(--font-fraunces)',
    body: 'var(--font-karla)',
    utility: 'var(--font-karla)',
  },
  technical: {
    display: 'var(--font-archivo-narrow)',
    body: 'var(--font-plex-sans)',
    utility: 'var(--font-plex-mono)',
  },
};

const SHAPES: Record<ShapeName, { sm: string; md: string; lg: string; pill: string }> = {
  soft: { sm: '0.375rem', md: '0.75rem', lg: '1.5rem', pill: '999px' },
  sharp: { sm: '0', md: '0', lg: '0', pill: '0' },
};

const DENSITIES: Record<DensityName, { sectionY: string; gap: string; measure: string }> = {
  comfortable: { sectionY: '7rem', gap: '2.5rem', measure: '34rem' },
  tight: { sectionY: '4.5rem', gap: '1.5rem', measure: '30rem' },
};

/** The names a stored theme may use for each choice, read from the tables above so they cannot drift apart. */
export const TYPE_SET_NAMES = Object.keys(TYPE_SETS) as TypeSetName[];
export const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];
export const DENSITY_NAMES = Object.keys(DENSITIES) as DensityName[];
export const TEXTURE_NAMES: TextureName[] = ['none', 'grain', 'grid'];
export const PALETTE_KEYS: (keyof Palette)[] = [
  'paper',
  'surface',
  'ink',
  'muted',
  'line',
  'brand',
  'onBrand',
  'accent',
];

/**
 * Flattens a theme into the CSS custom properties every block reads.
 * Blocks reference `--site-*` and nothing else, so a block can never carry a
 * colour, face or radius that one tenant cannot override.
 */
export function themeToCssVars(theme: SiteTheme): CSSProperties {
  const type = TYPE_SETS[theme.typeSet];
  const shape = SHAPES[theme.shape];
  const density = DENSITIES[theme.density];

  return {
    '--site-paper': theme.palette.paper,
    '--site-surface': theme.palette.surface,
    '--site-ink': theme.palette.ink,
    '--site-muted': theme.palette.muted,
    '--site-line': theme.palette.line,
    '--site-brand': theme.palette.brand,
    '--site-on-brand': theme.palette.onBrand,
    '--site-accent': theme.palette.accent,

    '--site-font-display': type.display,
    '--site-font-body': type.body,
    '--site-font-utility': type.utility,

    '--site-radius-sm': shape.sm,
    '--site-radius-md': shape.md,
    '--site-radius-lg': shape.lg,
    '--site-radius-pill': shape.pill,

    '--site-section-y': density.sectionY,
    '--site-gap': density.gap,
    '--site-measure': density.measure,
  } as CSSProperties;
}
