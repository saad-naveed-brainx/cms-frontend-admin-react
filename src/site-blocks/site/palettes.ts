import type { Palette } from '@/theme/theme';
import { DEFAULT_THEME } from './default-theme';

/** A ready-made palette: an internal name, what the Appearance screen calls it, and its eight colours. */
export type PaletteChoice = { name: string; label: string; palette: Palette };

/**
 * The palettes a site can start from (GOV-04, docs/DECISIONS.md D-036, the owner's option A): pick one,
 * then set the brand and accent colours to match the client's own. Every one passes the contrast
 * checks in e2e/palettes.spec.ts (text, muted text, text on the brand colour and the accent at least
 * 4.5:1). The first is the default theme's own, which every new site shows.
 */
export const PALETTES: PaletteChoice[] = [
  { name: 'classic', label: 'Classic blue', palette: DEFAULT_THEME.palette },
  {
    name: 'harbour',
    label: 'Harbour green',
    palette: {
      paper: '#f3f1ea',
      surface: '#ffffff',
      ink: '#13201c',
      muted: '#4f5d58',
      line: '#d3cdbf',
      brand: '#0f5c4d',
      onBrand: '#ffffff',
      accent: '#9a3f12',
    },
  },
  {
    name: 'bakery',
    label: 'Warm bakery',
    palette: {
      paper: '#fbf6ee',
      surface: '#ffffff',
      ink: '#2b1d14',
      muted: '#6a5444',
      line: '#e6d8c3',
      brand: '#8a3b12',
      onBrand: '#ffffff',
      accent: '#8f5a00',
    },
  },
  {
    name: 'slate',
    label: 'Slate',
    palette: {
      paper: '#f7f8fa',
      surface: '#ffffff',
      ink: '#111827',
      muted: '#4b5563',
      line: '#d1d5db',
      brand: '#334155',
      onBrand: '#ffffff',
      accent: '#0e7490',
    },
  },
  {
    name: 'night',
    label: 'Night',
    palette: {
      paper: '#0f1115',
      surface: '#181b21',
      ink: '#eef1f4',
      muted: '#a3acb9',
      line: '#2c313a',
      brand: '#8ab4ff',
      onBrand: '#0f1115',
      accent: '#f2b84b',
    },
  },
];
