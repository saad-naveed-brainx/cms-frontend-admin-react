import { ApiError, NetworkError, isRecord, problemsOf } from './api.ts'

/** The slug shape the API insists on: words of lower-case letters and digits joined by single hyphens. */
export const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A slug suggested from a title: "Our  Café & Bar!" becomes "our-cafe-bar". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/** A type's URL prefix and a slug make the page's address: `/blog` + `hello` is `/blog/hello`. The server builds the real one. */
export function addressFor(urlPrefix: string | null, slug: string): string {
  return `${(urlPrefix ?? '').replace(/\/+$/, '')}/${slug}`
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Published',
  scheduled: 'Scheduled',
}

export const STATUS_CHOICES = Object.entries(STATUS_LABELS)

export const statusLabel = (status: string): string => STATUS_LABELS[status] ?? status

/**
 * A content type's name for a menu or a list heading: "Page" is "Pages", "Story" is "Stories".
 * A stop-gap for English names until a content type carries its own plural label.
 */
export function pluralLabel(name: string): string {
  if (/s$/i.test(name)) return name
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`
  return `${name}s`
}

/** The list screen for one content type, or for all of them. */
export const listPath = (typeSlug?: string | null): string =>
  typeSlug ? `/pages?type=${encodeURIComponent(typeSlug)}` : '/pages'

/** "8 Oct 2026", in UTC so the same page reads the same everywhere. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** What to show after a save or create failed: lines the API listed by field go next to their field, the rest is one message. */
export type FormProblems = {
  fields: Record<string, string>
  form: string | null
}

export function describeFailure(error: unknown, fieldNames: string[]): FormProblems {
  if (error instanceof NetworkError) {
    return {
      fields: {},
      form: "Can't reach the server. Check your connection and try again.",
    }
  }
  if (error instanceof ApiError) {
    if (error.status === 400) {
      const fields: Record<string, string> = {}
      const rest: string[] = []
      for (const line of problemsOf(error)) {
        const [name, ...message] = line.split(': ')
        if (fieldNames.includes(name) && fields[name] === undefined) {
          fields[name] = message.join(': ')
        } else {
          rest.push(line)
        }
      }
      if (Object.keys(fields).length > 0 || rest.length > 0) {
        return { fields, form: rest.length > 0 ? rest.join(' ') : null }
      }
    }
    if (error.status === 403) {
      return { fields: {}, form: "You don't have permission to do that." }
    }
    if (error.status === 409) {
      return {
        fields: { slug: 'That address is already used by another page.' },
        form: null,
      }
    }
  }
  return { fields: {}, form: 'Something went wrong. Try again.' }
}

/** A web address as typed, without the spaces around it, a leading `https://` or a trailing slash. The API does the rest (capitals, the port). */
export function tidyAddress(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
}

/** The host an address stands for once the API has tidied it: lower-case, with no port. */
const hostOf = (value: string): string => tidyAddress(value).toLowerCase().replace(/:\d+$/, '')

/**
 * What to show after creating a site failed. Problems the API lists as `hostnames.N` go next to
 * address N (the screen sends its addresses in order), a taken address goes next to the one that is
 * taken, and the rest is one message.
 */
export function describeSiteFailure(error: unknown, addresses: string[]): FormProblems {
  if (error instanceof ApiError && error.status === 409) {
    const message = isRecord(error.body) ? String(error.body.message ?? '') : ''
    const taken = /"([^"]+)"/.exec(message)?.[1]
    const row = Math.max(
      0,
      addresses.findIndex((address) => hostOf(address) === taken),
    )
    return {
      fields: { [`hostnames.${row}`]: 'That web address is already used by another site.' },
      form: null,
    }
  }
  if (error instanceof ApiError && error.status === 403) {
    return { fields: {}, form: 'Only the owner of an organisation can create sites.' }
  }
  return describeFailure(error, [
    'name',
    'organizationId',
    ...addresses.map((_, index) => `hostnames.${index}`),
  ])
}
