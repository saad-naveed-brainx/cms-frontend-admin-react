/**
 * The admin's one way to talk to the API. The answers here mirror api/src/auth/auth.service.ts
 * (login and "who am I"); anything that does not look like them is treated as a failure, so the
 * screens never show a half-signed-in state.
 */

export type User = { id: string; email: string; name: string }

export type Membership = {
  site: { id: string; name: string }
  role: { id: string; name: string }
  permissions: string[]
}

export type Profile = { user: User; memberships: Membership[] }

export type LoginResult = Profile & {
  accessToken: string
  /** ISO 8601 */
  expiresAt: string
}

/** The server answered, but not with a success. */
export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`The server answered ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

/** No answer at all: the server or the network is down. */
export class NetworkError extends Error {
  constructor() {
    super('The server could not be reached')
    this.name = 'NetworkError'
  }
}

const baseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Sent as `Authorization: Bearer`. */
  token?: string | null
  /** Sent as `X-Site-Id`: the site the person is working on (admin invariant 4). */
  siteId?: string | null
}

/** Calls the API and returns the parsed JSON, unchecked: callers validate it with the guards below. */
export async function request(
  path: string,
  { method = 'GET', body, token, siteId }: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (siteId) headers['X-Site-Id'] = siteId

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }
  if (!response.ok) throw new ApiError(response.status)

  try {
    return await response.json()
  } catch {
    // A success status with a body that is not JSON is as unusable as an error.
    throw new ApiError(response.status)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.name === 'string'
  )
}

function isMembership(value: unknown): value is Membership {
  return (
    isRecord(value) &&
    isRecord(value.site) &&
    typeof value.site.id === 'string' &&
    typeof value.site.name === 'string' &&
    isRecord(value.role) &&
    typeof value.role.id === 'string' &&
    typeof value.role.name === 'string' &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === 'string')
  )
}

export function isProfile(value: unknown): value is Profile {
  return (
    isRecord(value) &&
    isUser(value.user) &&
    Array.isArray(value.memberships) &&
    value.memberships.every(isMembership)
  )
}

export function isLoginResult(value: unknown): value is LoginResult {
  return (
    isRecord(value) &&
    typeof value.accessToken === 'string' &&
    value.accessToken !== '' &&
    typeof value.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(value.expiresAt)) &&
    isProfile(value)
  )
}
