import { useSyncExternalStore } from 'react'
import { ApiError, NetworkError, isLoginResult, isProfile, request } from './api.ts'
import type { Membership, User } from './api.ts'

/**
 * Who is signed in, kept outside React so every screen and every API call sees the same answer.
 *
 * Only the token and its expiry are stored (`cms-admin.session`). The person, their sites and
 * their role are asked of the API on every load, so a removed member or a changed role shows up
 * at once. The site being worked on is remembered in `cms-admin.site`.
 */

export const SESSION_KEY = 'cms-admin.session'
export const SITE_KEY = 'cms-admin.site'
export const ENDED_NOTICE = 'Your session has ended. Sign in again.'

export type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'cannot-check' }
  | { status: 'signed-in'; user: User; memberships: Membership[]; siteId: string | null }

export type SignInOutcome = 'ok' | 'invalid' | 'unreachable' | 'failed'

let state: SessionState = { status: 'checking' }
let token: string | null = null
/** Bumped whenever the session changes under a check that is still running, so its answer is dropped. */
let generation = 0
const listeners = new Set<() => void>()

function setState(next: SessionState): void {
  state = next
  listeners.forEach((listener) => listener())
}

// Storage can be missing or refuse writes (private windows, blocked site data): the session then
// simply lasts until the tab closes.
function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // see above
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // see above
  }
}

/** The stored token and expiry, or null. A value that is not exactly that shape is removed. */
function readStoredSession(): { accessToken: string; expiresAt: string } | null {
  const raw = storageGet(SESSION_KEY)
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const { accessToken, expiresAt } = value as Record<string, unknown>
      if (
        typeof accessToken === 'string' &&
        accessToken !== '' &&
        typeof expiresAt === 'string' &&
        !Number.isNaN(Date.parse(expiresAt))
      ) {
        return { accessToken, expiresAt }
      }
    }
  } catch {
    // not JSON: treated like any other broken value
  }
  storageRemove(SESSION_KEY)
  return null
}

/** The remembered site if the person still belongs to it, otherwise their first one. */
function pickSite(memberships: Membership[]): string | null {
  const remembered = storageGet(SITE_KEY)
  const chosen =
    memberships.find((membership) => membership.site.id === remembered)?.site.id ??
    memberships[0]?.site.id ??
    null
  if (chosen === null) storageRemove(SITE_KEY)
  else if (chosen !== remembered) storageSet(SITE_KEY, chosen)
  return chosen
}

function endSession(notice: string | null): void {
  token = null
  storageRemove(SESSION_KEY)
  storageRemove(SITE_KEY)
  setState({ status: 'signed-out', notice })
}

/**
 * Calls the API as the signed-in person: the token and the chosen site go with the request, and a
 * 401 ends the session. Every screen that needs the API goes through here.
 */
export async function authed(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<unknown> {
  const siteId = state.status === 'signed-in' ? state.siteId : storageGet(SITE_KEY)
  try {
    return await request(path, { ...options, token, siteId })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) endSession(ENDED_NOTICE)
    throw error
  }
}

/** Looks at what is stored and asks the API who it belongs to. Used at start-up, on retry and when another tab signs in or out. */
async function start(): Promise<void> {
  generation += 1
  const mine = generation

  const stored = readStoredSession()
  if (stored === null) {
    token = null
    setState({ status: 'signed-out', notice: null })
    return
  }
  if (Date.parse(stored.expiresAt) <= Date.now()) {
    endSession(ENDED_NOTICE)
    return
  }

  token = stored.accessToken
  setState({ status: 'checking' })
  try {
    const profile = await authed('/auth/me')
    if (mine !== generation) return
    if (!isProfile(profile)) {
      setState({ status: 'cannot-check' })
      return
    }
    setState({
      status: 'signed-in',
      user: profile.user,
      memberships: profile.memberships,
      siteId: pickSite(profile.memberships),
    })
  } catch (error) {
    if (mine !== generation) return
    // A 401 already ended the session inside `authed`. Anything else is not the person's fault, so
    // the saved session stays and they can try again.
    if (!(error instanceof ApiError && error.status === 401)) {
      setState({ status: 'cannot-check' })
    }
  }
}

export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  try {
    const result = await request('/auth/login', { method: 'POST', body: { email, password } })
    if (!isLoginResult(result)) return 'failed'

    generation += 1
    token = result.accessToken
    storageSet(
      SESSION_KEY,
      JSON.stringify({ accessToken: result.accessToken, expiresAt: result.expiresAt }),
    )
    setState({
      status: 'signed-in',
      user: result.user,
      memberships: result.memberships,
      siteId: pickSite(result.memberships),
    })
    return 'ok'
  } catch (error) {
    if (error instanceof NetworkError) return 'unreachable'
    if (error instanceof ApiError && error.status === 401) return 'invalid'
    return 'failed'
  }
}

/** Forgets the session in this browser. The token itself stays valid on the server until it expires (docs/DECISIONS.md D-018). */
export function signOut(): void {
  generation += 1
  endSession(null)
}

export function selectSite(siteId: string): void {
  if (state.status !== 'signed-in') return
  if (!state.memberships.some((membership) => membership.site.id === siteId)) return
  storageSet(SITE_KEY, siteId)
  setState({ ...state, siteId })
}

export function retry(): void {
  void start()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state)
}

// Another tab signed in or out: follow it. (A tab does not hear about its own changes.)
window.addEventListener('storage', (event) => {
  if (event.key === SESSION_KEY || event.key === null) void start()
})

void start()
