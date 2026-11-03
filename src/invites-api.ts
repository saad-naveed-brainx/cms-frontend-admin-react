import { ApiError, NetworkError, isLoginResult, isRecord, request } from './api.ts'
import type { LoginResult } from './api.ts'
import { describeFailure } from './helpers.ts'
import type { FormProblems } from './helpers.ts'
import { apiMessage } from './members-api.ts'

/**
 * The two routes behind the invite page, open to whoever holds the link (api/src/invitations/): what
 * the link is for, and accepting it. Each answer is checked for the fields the page reads; anything
 * else is treated as a failure.
 */

export type InviteDetails = {
  siteName: string
  roleName: string
  email: string
  /** Whether the email already has an account: then the page asks only for its password. */
  hasAccount: boolean
}

export type Lookup =
  | { status: 'valid'; invite: InviteDetails }
  /** Used, cancelled, expired and unknown links are all the same 404. */
  | { status: 'dead' }
  | { status: 'cannot-check' }

export async function lookupInvite(token: string): Promise<Lookup> {
  try {
    const answer = await request('/invitations/lookup', { method: 'POST', body: { token } })
    if (
      isRecord(answer) &&
      isRecord(answer.site) &&
      typeof answer.site.name === 'string' &&
      isRecord(answer.role) &&
      typeof answer.role.name === 'string' &&
      typeof answer.email === 'string' &&
      typeof answer.hasAccount === 'boolean'
    ) {
      return {
        status: 'valid',
        invite: {
          siteName: answer.site.name,
          roleName: answer.role.name,
          email: answer.email,
          hasAccount: answer.hasAccount,
        },
      }
    }
    return { status: 'cannot-check' }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { status: 'dead' }
    return { status: 'cannot-check' }
  }
}

export type Accepted =
  | { status: 'joined'; result: LoginResult }
  | { status: 'dead' }
  /** The email got an account after the page was opened as "create one": ask for its password instead. */
  | { status: 'has-account'; message: string }
  | { status: 'wrong-password' }
  /** The sign-in limit has paused this email (users-roles T4); the API says for how long. */
  | { status: 'paused'; message: string }
  | { status: 'refused'; problems: FormProblems }

/**
 * Accepts the invite. With an existing account only `password` is sent (the API checks it as at
 * sign-in); for a new one the `name` goes too, and the API makes the account. Every answer is one
 * of the cases above, so the page never has to read a status.
 */
export async function acceptInvite(
  token: string,
  password: string,
  name?: string,
): Promise<Accepted> {
  try {
    const body = name === undefined ? { token, password } : { token, password, name }
    const answer = await request('/invitations/accept', { method: 'POST', body })
    if (!isLoginResult(answer)) return { status: 'refused', problems: unusable() }
    return { status: 'joined', result: answer }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return { status: 'dead' }
      // Only an existing account's password is checked, so only then is a 401 a wrong password.
      if (error.status === 401 && name === undefined) return { status: 'wrong-password' }
      if (error.status === 409) {
        return {
          status: 'has-account',
          message: apiMessage(error) ?? 'This email already has an account. Sign in to join.',
        }
      }
      if (error.status === 429) {
        return {
          status: 'paused',
          message: apiMessage(error) ?? 'Too many sign-in attempts. Try again later.',
        }
      }
    }
    if (error instanceof NetworkError || error instanceof ApiError) {
      return { status: 'refused', problems: describeFailure(error, ['name', 'password']) }
    }
    throw error
  }
}

const unusable = (): FormProblems => ({ fields: {}, form: 'Something went wrong. Try again.' })
