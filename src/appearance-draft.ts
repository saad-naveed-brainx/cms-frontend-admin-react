import { contrast, READABLE, textOn } from '@/site/contrast'
import { DEFAULT_THEME } from '@/site/default-theme'
import { PALETTES } from '@/site/palettes'
import { resolveTheme } from '@/site/resolve-theme'
import type {
  DensityName,
  Palette,
  ShapeName,
  SiteTheme,
  TextureName,
  TypeSetName,
} from '@/theme/theme'
import type { Appearance, AppearanceChange } from './appearance-api.ts'

/**
 * The Appearance screen's form (GOV-04, D-036, the owner's option A): a site starts from one of the
 * website's ready-made palettes (`src/site/palettes.ts`, copied), then sets its own brand and accent
 * colours. Text on the brand colour is chosen for it, so buttons stay readable.
 */
export type AppearanceDraft = {
  name: string
  tagline: string
  footerNote: string
  /** The ready-made palette the colours start from; `null` when the stored ones match none (kept as they are). */
  paletteName: string | null
  /** The colours the site starts from: the chosen palette's, or the stored ones. */
  base: Palette
  brand: string
  accent: string
  typeSet: TypeSetName
  shape: ShapeName
  density: DensityName
  texture: TextureName
}

/** The colours that make a palette what it is; brand and accent are the site's own on top. */
const BASE_KEYS = ['paper', 'surface', 'ink', 'muted', 'line'] as const

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function draftFrom(appearance: Appearance): AppearanceDraft {
  const theme = resolveTheme(appearance.theme)
  const match = PALETTES.find((choice) =>
    BASE_KEYS.every((key) => same(choice.palette[key], theme.palette[key])),
  )
  return {
    name: appearance.name,
    tagline: appearance.tagline,
    footerNote: appearance.footerNote,
    paletteName: match?.name ?? null,
    base: match?.palette ?? theme.palette,
    brand: theme.palette.brand,
    accent: theme.palette.accent,
    typeSet: theme.typeSet,
    shape: theme.shape,
    density: theme.density,
    texture: theme.texture,
  }
}

/** Picking a palette starts from all of its colours, its own brand and accent included. */
export function withPalette(draft: AppearanceDraft, name: string): AppearanceDraft {
  const choice = PALETTES.find((palette) => palette.name === name)
  if (!choice) return draft
  return {
    ...draft,
    paletteName: choice.name,
    base: choice.palette,
    brand: choice.palette.brand,
    accent: choice.palette.accent,
  }
}

/**
 * Text on the brand colour: the palette's own while the brand is the palette's, otherwise the more
 * readable of white and near-black.
 */
export function onBrandFor(draft: AppearanceDraft): string {
  return same(draft.brand, draft.base.brand) ? draft.base.onBrand : textOn(draft.brand)
}

/** The whole theme the form describes, as the website draws it and the API stores it. */
export function themeFrom(draft: AppearanceDraft): SiteTheme {
  return {
    typeSet: draft.typeSet,
    shape: draft.shape,
    density: draft.density,
    texture: draft.texture,
    palette: {
      ...draft.base,
      brand: draft.brand,
      onBrand: onBrandFor(draft),
      accent: draft.accent,
    },
  }
}

function sameTheme(a: SiteTheme, b: SiteTheme): boolean {
  return (
    a.typeSet === b.typeSet &&
    a.shape === b.shape &&
    a.density === b.density &&
    a.texture === b.texture &&
    (Object.keys(a.palette) as (keyof Palette)[]).every((key) =>
      same(a.palette[key], b.palette[key]),
    )
  )
}

/**
 * What Save sends: only what changed. The theme goes whole when any part of it changed; a new site's
 * theme (`{}`) is the default, so leaving the default as it is sends nothing.
 */
export function appearanceChanges(draft: AppearanceDraft, saved: Appearance): AppearanceChange {
  const changes: AppearanceChange = {}
  if (draft.name.trim() !== saved.name) changes.name = draft.name.trim()
  if (draft.tagline.trim() !== saved.tagline) changes.tagline = draft.tagline.trim()
  if (draft.footerNote.trim() !== saved.footerNote) changes.footerNote = draft.footerNote.trim()
  const theme = themeFrom(draft)
  if (!sameTheme(theme, resolveTheme(saved.theme))) changes.theme = theme
  return changes
}

export type DraftField = 'name' | 'tagline' | 'footerNote'

/** The problems with what is typed, as the API would find them, by field. */
export function validateDraft(draft: AppearanceDraft): Partial<Record<DraftField, string>> {
  const problems: Partial<Record<DraftField, string>> = {}
  const name = draft.name.trim()
  if (name === '') problems.name = 'Enter the site’s name.'
  else if (name.length > 120) problems.name = 'Use 120 characters or fewer.'
  if (draft.tagline.trim().length > 120) problems.tagline = 'Use 120 characters or fewer.'
  if (draft.footerNote.trim().length > 300) problems.footerNote = 'Use 300 characters or fewer.'
  return problems
}

/** The weakest contrast a colour has with the site's backgrounds, or `null` when it cannot be measured. */
function weakest(colour: string, backgrounds: string[]): number | null {
  const ratios = backgrounds.map((background) => contrast(colour, background))
  return ratios.some((ratio) => ratio === null) ? null : Math.min(...(ratios as number[]))
}

const asRatio = (ratio: number) => `${ratio.toFixed(1)}:1`

/** A warning when the accent (small labels and highlights) is hard to read on the site's backgrounds. */
export function accentWarning(draft: AppearanceDraft): string | null {
  const ratio = weakest(draft.accent, [draft.base.paper, draft.base.surface])
  return ratio !== null && ratio < READABLE
    ? `Hard to read: small text in this colour has ${asRatio(ratio)} contrast with the background; aim for ${READABLE}:1 or more.`
    : null
}

/** A warning when no text colour reads well on the brand colour (a mid-tone). */
export function brandWarning(draft: AppearanceDraft): string | null {
  const ratio = contrast(onBrandFor(draft), draft.brand)
  return ratio !== null && ratio < READABLE
    ? `Button text is hard to read on this colour (${asRatio(ratio)}); a lighter or darker shade reads better.`
    : null
}

/**
 * A colour as a colour picker can show it (`#rrggbb`). A stored colour of another kind (`oklch(…)`)
 * shows as the default text colour until one is picked; it is kept as it is until then.
 */
export function pickerValue(colour: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1]
  if (!hex) return DEFAULT_THEME.palette.ink
  return `#${(hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex).toLowerCase()}`
}
