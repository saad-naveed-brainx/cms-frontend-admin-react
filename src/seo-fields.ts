import type { Page, PageSeo } from './pages-api.ts'

/**
 * A page's search-engine fields (SEO-01) as the edit screen holds them while they are typed: a box
 * left empty is `''`, which Save sends as `null` (none), so the website uses the page's own title
 * and address. The rules match the API's (api/src/content/content-input.ts), so a value the API
 * would refuse is caught here first.
 */
export type SeoDraft = {
  seoTitle: string
  seoDescription: string
  canonicalUrl: string
  noIndex: boolean
}

export type SeoField = keyof SeoDraft

/** Roughly what Google shows before cutting a result off. A guide shown beside the boxes, not a limit. */
export const SHOWN_TITLE = 60
export const SHOWN_DESCRIPTION = 160

const MAX = { seoTitle: 200, seoDescription: 500, canonicalUrl: 2000 }

export function seoDraftFrom(page: PageSeo): SeoDraft {
  return {
    seoTitle: page.seoTitle ?? '',
    seoDescription: page.seoDescription ?? '',
    canonicalUrl: page.canonicalUrl ?? '',
    noIndex: page.noIndex,
  }
}

const orNull = (value: string): string | null => value.trim() || null

/** What Save sends for the search fields: only the ones that changed, an empty box as `null`. */
export function seoChanges(draft: SeoDraft, page: Page): Partial<PageSeo> {
  const changes: Partial<PageSeo> = {}
  for (const field of ['seoTitle', 'seoDescription', 'canonicalUrl'] as const) {
    const value = orNull(draft[field])
    if (value !== page[field]) changes[field] = value
  }
  if (draft.noIndex !== page.noIndex) changes.noIndex = draft.noIndex
  return changes
}

/** A full `https://` or `http://` address, as the API asks for a canonical one. */
export function isFullAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== ''
  } catch {
    return false
  }
}

/** The problems with what is typed, by field; empty when Save may go ahead. */
export function validateSeo(draft: SeoDraft): Partial<Record<SeoField, string>> {
  const problems: Partial<Record<SeoField, string>> = {}
  if (draft.seoTitle.trim().length > MAX.seoTitle) {
    problems.seoTitle = `Use ${MAX.seoTitle} characters or fewer.`
  }
  if (draft.seoDescription.trim().length > MAX.seoDescription) {
    problems.seoDescription = `Use ${MAX.seoDescription} characters or fewer.`
  }
  const canonical = draft.canonicalUrl.trim()
  if (canonical !== '' && !isFullAddress(canonical)) {
    problems.canonicalUrl = 'Use a full address starting with https:// or http://.'
  } else if (canonical.length > MAX.canonicalUrl) {
    problems.canonicalUrl = `Use ${MAX.canonicalUrl} characters or fewer.`
  }
  return problems
}

/**
 * An address as a search result shows it: `orchard.test › about › team`. Falls back to the text
 * as given when it is not a full address.
 */
export function resultAddress(address: string): string {
  try {
    const url = new URL(address)
    return [url.host, ...url.pathname.split('/').filter(Boolean)].join(' › ')
  } catch {
    return address
  }
}

/** Text cut where a search result would cut it, with an ellipsis. */
export function shorten(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text
}
