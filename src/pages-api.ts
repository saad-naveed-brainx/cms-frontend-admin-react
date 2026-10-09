import { ApiError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * The content API as the page screens use it (api/src/content/). Each answer is checked for the
 * fields the screens read; anything else is treated as a failure, never shown half-filled.
 */

export type PageType = {
  id: string
  slug: string
  name: string
  urlPrefix: string | null
}

export type PageSummary = {
  id: string
  type: { id: string; slug: string; name: string }
  title: string
  slug: string
  path: string
  status: string
  createdBy: string | null
  updatedAt: string
}

export type Page = PageSummary & { blocks: unknown[] }

export type PageList = {
  items: PageSummary[]
  total: number
  limit: number
  offset: number
}

export type PageQuery = {
  type?: string
  status?: string
  limit: number
  offset: number
}

const unusable = () => new ApiError(502)

function isPageType(value: unknown): value is PageType {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.name === 'string' &&
    (value.urlPrefix === null || typeof value.urlPrefix === 'string')
  )
}

function isPageSummary(value: unknown): value is PageSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.type) &&
    typeof value.type.id === 'string' &&
    typeof value.type.slug === 'string' &&
    typeof value.type.name === 'string' &&
    typeof value.title === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.path === 'string' &&
    typeof value.status === 'string' &&
    (value.createdBy === null || typeof value.createdBy === 'string') &&
    typeof value.updatedAt === 'string'
  )
}

function isPage(value: unknown): value is Page {
  return isRecord(value) && Array.isArray(value.blocks) && isPageSummary(value)
}

export async function fetchTypes(): Promise<PageType[]> {
  const answer = await authed('/content-types')
  if (!isRecord(answer) || !Array.isArray(answer.items) || !answer.items.every(isPageType)) {
    throw unusable()
  }
  return answer.items
}

export async function fetchPages(query: PageQuery): Promise<PageList> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
  })
  if (query.type) params.set('type', query.type)
  if (query.status) params.set('status', query.status)

  const answer = await authed(`/content?${params}`)
  if (
    !isRecord(answer) ||
    !Array.isArray(answer.items) ||
    !answer.items.every(isPageSummary) ||
    typeof answer.total !== 'number' ||
    typeof answer.limit !== 'number' ||
    typeof answer.offset !== 'number'
  ) {
    throw unusable()
  }
  return {
    items: answer.items,
    total: answer.total,
    limit: answer.limit,
    offset: answer.offset,
  }
}

export async function fetchPage(id: string): Promise<Page> {
  const answer = await authed(`/content/${encodeURIComponent(id)}`)
  if (!isPage(answer)) throw unusable()
  return answer
}

export async function createPage(body: {
  type: string
  title: string
  slug: string
}): Promise<Page> {
  const answer = await authed('/content', { method: 'POST', body })
  if (!isPage(answer)) throw unusable()
  return answer
}

/** Saves what changed: the title, the blocks, or both. */
export async function savePage(
  id: string,
  body: { title?: string; blocks?: unknown[] },
): Promise<Page> {
  const answer = await authed(`/content/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  })
  if (!isPage(answer)) throw unusable()
  return answer
}

/** Makes the page live. The API answers with the page as it is now. */
export async function publishPage(id: string): Promise<Page> {
  const answer = await authed(`/content/${encodeURIComponent(id)}/publish`, { method: 'POST' })
  if (!isPage(answer)) throw unusable()
  return answer
}

/** Takes the page back to a draft. */
export async function unpublishPage(id: string): Promise<Page> {
  const answer = await authed(`/content/${encodeURIComponent(id)}/unpublish`, { method: 'POST' })
  if (!isPage(answer)) throw unusable()
  return answer
}

/**
 * A 30-minute link that shows the page as last saved on its site, published or not. The API
 * answers `{ token, expiresAt }`; the website opens it as `?preview=<token>`.
 */
export async function requestPreview(id: string): Promise<{ token: string; expiresAt: string }> {
  const answer = await authed(`/content/${encodeURIComponent(id)}/preview`, { method: 'POST' })
  if (!isRecord(answer) || typeof answer.token !== 'string' || typeof answer.expiresAt !== 'string') {
    throw unusable()
  }
  return { token: answer.token, expiresAt: answer.expiresAt }
}
