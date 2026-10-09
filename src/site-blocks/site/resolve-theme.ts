import { isRecord } from '@/lib/guards';
import {
  DENSITY_NAMES,
  PALETTE_KEYS,
  SHAPE_NAMES,
  TEXTURE_NAMES,
  TYPE_SET_NAMES,
  type Palette,
  type SiteTheme,
} from '@/theme/theme';
import { DEFAULT_THEME } from './default-theme';

/** A colour a theme may use: hex, or rgb / hsl / oklch / oklab with plain numbers. Nothing that could carry more than a colour. */
const COLOUR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|oklch|oklab)\([0-9a-z .,%/+-]{1,60}\))$/i;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((name) => name === value) ?? fallback;
}

/**
 * A site's theme as it is stored (`sites.theme`, empty for a new site) laid over the default: every
 * choice that is missing, or not one of the offered names or a valid colour, falls back to the
 * default's. So a site can never be broken by what is stored, and a new site is simply the default.
 */
export function resolveTheme(stored: unknown): SiteTheme {
  const theme = isRecord(stored) ? stored : {};
  const colours = isRecord(theme.palette) ? theme.palette : {};

  const palette = Object.fromEntries(
    PALETTE_KEYS.map((key) => {
      const value = colours[key];
      return [key, typeof value === 'string' && COLOUR.test(value) ? value : DEFAULT_THEME.palette[key]];
    }),
  ) as Palette;

  return {
    typeSet: pick(theme.typeSet, TYPE_SET_NAMES, DEFAULT_THEME.typeSet),
    shape: pick(theme.shape, SHAPE_NAMES, DEFAULT_THEME.shape),
    density: pick(theme.density, DENSITY_NAMES, DEFAULT_THEME.density),
    texture: pick(theme.texture, TEXTURE_NAMES, DEFAULT_THEME.texture),
    palette,
  };
}
