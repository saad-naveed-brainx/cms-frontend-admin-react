import type { Page, Request, Route } from '@playwright/test'
import { flowApiPort } from '../flow/env.ts'

/**
 * Helpers for the tests that do NOT use the real API: they answer the API's calls themselves, for
 * states the real one cannot be made to produce on demand (server down, a 500, a slow answer, an
 * account with no sites) and for screenshots that must look the same every time. The real flow is
 * in e2e/flow/. The shapes below mirror api/src/auth/auth.service.ts.
 */

export const SESSION_KEY = 'cms-admin.session'
export const SITE_KEY = 'cms-admin.site'

export const person = {
  id: '0198f2a0-0000-7000-8000-0000000000f1',
  email: 'olivia@orchard.test',
  name: 'Olivia Orchard',
}

export const orchard = {
  site: { id: '0198f2a0-0000-7000-8000-000000000001', name: 'Orchard Bakery' },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a1', name: 'Administrator' },
  permissions: ['content.read', 'content.write', 'members.manage'],
}

export const maple = {
  site: { id: '0198f2a0-0000-7000-8000-000000000002', name: 'Maple Books' },
  role: { id: '0198f2a0-0000-7000-8000-0000000000a2', name: 'Editor' },
  permissions: ['content.read', 'content.write'],
}

export const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString()

export const profileBody = (memberships = [orchard, maple]) => ({ user: person, memberships })

export const loginBody = (memberships = [orchard, maple]) => ({
  accessToken: 'mock-access-token',
  tokenType: 'Bearer',
  expiresAt: inDays(7),
  ...profileBody(memberships),
})

/** Answers a call with a status and a body. The API is another origin, so the answer says it may be read. */
export function fulfill(route: Route, status: number, body: unknown, contentType = 'application/json') {
  return route.fulfill({
    status,
    contentType,
    headers: { 'access-control-allow-origin': '*' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Every call the page makes to the API's /auth/ routes, in order. */
export function authCalls(page: Page) {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/auth/')) {
      calls.push({ method: request.method(), path: pathname, headers: request.headers() })
    }
  })
  return calls
}

export const readStorage = (page: Page, key: string) =>
  page.evaluate((name) => localStorage.getItem(name), key)

/** Puts values in the browser's storage and reloads, so the app starts with them in place. */
export async function seedStorage(page: Page, entries: Record<string, string>) {
  await page.goto('/')
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value)
  }, entries)
  await page.reload()
}

// ---- the content API (CNT-01), for the page screens ----

export const pageType = {
  id: '0198f2a0-0000-7000-8000-0000000000b1',
  slug: 'page',
  name: 'Page',
  urlPrefix: null,
  hierarchical: true,
  hasCategories: false,
  hasTags: false,
  isBuiltin: true,
}

export const postType = {
  id: '0198f2a0-0000-7000-8000-0000000000b2',
  slug: 'post',
  name: 'Post',
  urlPrefix: '/blog',
  hierarchical: false,
  hasCategories: true,
  hasTags: true,
  isBuiltin: true,
}

export type FakePage = {
  id: string
  type: { id: string; slug: string; name: string }
  parentId: string | null
  title: string
  slug: string
  path: string
  status: string
  publishedAt: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  blocks: unknown[]
  data: Record<string, unknown>
}

const typeRef = (type: { id: string; slug: string; name: string }) => ({
  id: type.id,
  slug: type.slug,
  name: type.name,
})

/** A page as the content API answers. `n` keeps ids and dates apart; any field can be given. */
export function fakePage(n: number, fields: Partial<FakePage> = {}): FakePage {
  const slug = fields.slug ?? `page-${n}`
  return {
    id: `0198f2a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    type: typeRef(pageType),
    parentId: null,
    title: `Page ${n}`,
    slug,
    path: `/${slug}`,
    status: 'draft',
    publishedAt: null,
    createdBy: person.id,
    updatedBy: person.id,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: `2026-10-0${1 + (n % 8)}T10:00:00.000Z`,
    blocks: [],
    data: {},
    ...fields,
  }
}

const summaryOf = (page: FakePage) =>
  Object.fromEntries(Object.entries(page).filter(([key]) => key !== 'blocks' && key !== 'data'))

type Handler = (route: Route, request: Request) => boolean | Promise<boolean>

/**
 * A stand-in content API with a list of pages the test can read and change. `calls` records every
 * request, and `override` lets a test answer a request itself (a 403, no connection): return true
 * when it has.
 */
export async function fakeContent(page: Page, initial: FakePage[] = []) {
  const state = {
    pages: [...initial],
    calls: [] as string[],
    override: null as Handler | null,
  }

  await page.route(
    (url) => url.port === String(flowApiPort) && /^\/content(-types)?(\/|$)/.test(url.pathname),
    async (route, request) => {
      const url = new URL(request.url())
      const method = request.method()
      state.calls.push(`${method} ${url.pathname}${url.search}`)
      if (state.override && (await state.override(route, request))) return

      if (url.pathname === '/content-types' && method === 'GET') {
        return fulfill(route, 200, { items: [pageType, postType] })
      }
      if (url.pathname === '/content' && method === 'GET') {
        const type = url.searchParams.get('type')
        const status = url.searchParams.get('status')
        const limit = Number(url.searchParams.get('limit') ?? 25)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const matching = state.pages.filter(
          (item) => (!type || item.type.slug === type) && (!status || item.status === status),
        )
        return fulfill(route, 200, {
          items: matching.slice(offset, offset + limit).map(summaryOf),
          total: matching.length,
          limit,
          offset,
        })
      }
      if (url.pathname === '/content' && method === 'POST') {
        const body = request.postDataJSON() as { type: string; title: string; slug: string }
        const type = [pageType, postType].find((item) => item.slug === body.type)
        if (!type) return fulfill(route, 400, { message: 'Invalid request', errors: ['type: unknown'] })
        const created = fakePage(state.pages.length + 100, {
          type: typeRef(type),
          title: body.title,
          slug: body.slug,
          path: `${type.urlPrefix ?? ''}/${body.slug}`,
        })
        state.pages.unshift(created)
        return fulfill(route, 201, created)
      }
      const one = url.pathname.match(/^\/content\/([^/]+)$/)
      if (one) {
        const found = state.pages.find((item) => item.id === one[1])
        if (!found) return fulfill(route, 404, { message: 'Page not found' })
        if (method === 'GET') return fulfill(route, 200, found)
        if (method === 'PATCH') {
          Object.assign(found, request.postDataJSON(), { updatedAt: '2026-10-09T10:00:00.000Z' })
          return fulfill(route, 200, found)
        }
      }
      return fulfill(route, 404, { message: 'Not found' })
    },
  )
  return state
}

/** Opens the app signed in as the mock person, on one site, with a role that holds exactly these permissions. */
export async function signedInAs(page: Page, permissions: string[]) {
  const membership = { ...orchard, role: { ...orchard.role, name: 'Tester' }, permissions }
  await page.route('**/auth/me', (route) => fulfill(route, 200, profileBody([membership])))
  await seedStorage(page, {
    [SESSION_KEY]: JSON.stringify({ accessToken: 'saved-token', expiresAt: inDays(1) }),
  })
}
