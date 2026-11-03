import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { LoginResult } from './api.ts'
import { acceptInvite, lookupInvite, secretsOf } from './invites-api.ts'
import type { Accepted, InviteDetails } from './invites-api.ts'
import { startSession, useSession } from './session.ts'

/** The API's rule for a new password (api/src/invitations/invitations.service.ts). */
const PASSWORD_MIN = 12

/** One website's part of a link: its secret and what the API says it is for. */
type Part = { token: string; invite: InviteDetails }

type Load =
  | { status: 'checking' }
  | { status: 'dead' }
  | { status: 'cannot-check' }
  /** `parts` are the live ones, in the link's order; `lost` counts the parts that are no longer valid; `several` says the link had more than one secret. */
  | { status: 'ready'; parts: Part[]; lost: number; several: boolean }

/** "A", "A and B", "A, B and C". */
function joinWords(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/**
 * The page an invite link opens (`/invite#<secret>`, or `#<secret>.<secret>` for several websites of
 * one organization, organizations T8, D-055). It is shown before anyone is signed in, and whoever is
 * signed in does not matter yet: someone with no account makes one (a name and a password), someone
 * with an account signs in with its password, and either way they land on the site they were invited
 * to (the first of the link). The secrets are read from the `#` part of the address, which never
 * reaches a server or a log, and the address loses them once they have joined. Joining while someone
 * else is signed in here replaces that session, and the page says so first.
 *
 * A link of several secrets is looked up part by part and joined part by part. Parts that are dead are
 * left out and said so; secrets made for different emails or organizations, or more than 20, are a dead
 * link. For an existing account the password is tried on the first part only: a wrong one stops there,
 * so it cannot use up the sign-in limit once for every website. If a later part fails after one worked,
 * the person is signed in with what they have and told which website is missing.
 */
export default function Invite() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const secrets = useMemo(() => secretsOf(hash), [hash])
  const [load, setLoad] = useState<Load>(
    secrets === null || secrets.length === 0 ? { status: 'dead' } : { status: 'checking' },
  )
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (secrets === null || secrets.length === 0) return
    let cancelled = false
    void Promise.all(secrets.map((token) => lookupInvite(token))).then((answers) => {
      if (cancelled) return
      if (answers.some((answer) => answer.status === 'cannot-check')) {
        setLoad({ status: 'cannot-check' })
        return
      }
      const parts: Part[] = []
      answers.forEach((answer, at) => {
        if (answer.status === 'valid') parts.push({ token: secrets[at], invite: answer.invite })
      })
      const [first] = parts
      // No live part, or parts made for different people or organizations: the usual dead link.
      const together = parts.every(
        (part) =>
          part.invite.email.toLowerCase() === first?.invite.email.toLowerCase() &&
          part.invite.organization?.id === first?.invite.organization?.id,
      )
      if (parts.length === 0 || !together) {
        setLoad({ status: 'dead' })
        return
      }
      setLoad({
        status: 'ready',
        parts,
        lost: secrets.length - parts.length,
        several: secrets.length > 1,
      })
    })
    return () => {
      cancelled = true
    }
  }, [secrets, attempt])

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (load.status !== 'ready' || inFlight.current) return
    const { parts } = load
    // All parts are for the same person, so what the first says about the account holds for the rest.
    const invite = parts[0].invite

    const found: Record<string, string> = {}
    if (!invite.hasAccount && name.trim() === '') found.name = 'Enter your name.'
    if (password === '') {
      found.password = invite.hasAccount ? 'Enter your password.' : 'Choose a password.'
    } else if (!invite.hasAccount && password.length < PASSWORD_MIN) {
      found.password = `Use at least ${PASSWORD_MIN} characters.`
    }
    setErrors(found)
    setFormError(null)
    if (found.name || found.password) {
      const firstProblem = found.name ? nameInput : passwordInput
      firstProblem.current?.focus()
      return
    }

    inFlight.current = true
    setBusy(true)
    const joined: { part: Part; result: LoginResult }[] = []
    const missed: Part[] = []
    // Whether the account exists by now: the first accept of a new person makes it, the rest send the password only.
    let account = invite.hasAccount
    try {
      for (const [at, part] of parts.entries()) {
        const outcome = await acceptInvite(part.token, password, account ? undefined : name.trim())
        if (outcome.status === 'joined') {
          joined.push({ part, result: outcome.result })
          account = true
          continue
        }
        // After one website worked, a later one failing leaves the person with what they have.
        if (joined.length > 0) {
          missed.push(part)
          continue
        }
        // A part that went dead since the page opened: the next one may still be good.
        if (outcome.status === 'dead' && at < parts.length - 1) {
          missed.push(part)
          continue
        }
        // Nothing has worked yet, so what went wrong is theirs to fix, as with a link of one secret,
        // and no more is tried: a wrong password is attempted once, not once for every website.
        stop(outcome)
        return
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }

    const last = joined.at(-1)
    if (last === undefined) {
      setLoad({ status: 'dead' })
      return
    }
    const first = joined[0].part.invite
    startSession(last.result, first)
    const names = (list: Part[]) => joinWords(list.map((part) => part.invite.siteName))
    navigate('/', {
      replace: true,
      state:
        missed.length > 0
          ? {
              notice: `You joined ${names(joined.map((one) => one.part))}, but not ${names(missed)}. Open the link again.`,
            }
          : null,
    })
  }

  /** What to show when the first accept that was tried did not work (the page stays, with what they typed). */
  function stop(outcome: Exclude<Accepted, { status: 'joined' }>) {
    switch (outcome.status) {
      case 'dead':
        setLoad({ status: 'dead' })
        return
      case 'has-account':
        // The email got an account after this page opened: the same invite, now asking for its password.
        setLoad((before) =>
          before.status === 'ready'
            ? {
                ...before,
                parts: before.parts.map((part) => ({
                  ...part,
                  invite: { ...part.invite, hasAccount: true },
                })),
              }
            : before,
        )
        setPassword('')
        setFormError(outcome.message)
        return
      case 'wrong-password':
        setPassword('')
        setErrors({ password: 'Password is incorrect.' })
        passwordInput.current?.focus()
        return
      case 'paused':
        setPassword('')
        setFormError(outcome.message)
        return
      case 'refused':
        setErrors(outcome.problems.fields)
        setFormError(outcome.problems.form)
        return
    }
  }

  return (
    <main className="auth">
      <p className="login-logo">CMS admin</p>
      <div className="login-box">
        {load.status === 'checking' && <p role="status">Checking your invite…</p>}

        {load.status === 'dead' && (
          <>
            <h1>Invite</h1>
            <p role="alert">This invite is no longer valid. Ask for a new one.</p>
            <p>
              <Link to="/">Sign in</Link>
            </p>
          </>
        )}

        {load.status === 'cannot-check' && (
          <>
            <h1>Invite</h1>
            <p role="alert">Can't check this invite right now. Try again.</p>
            <button
              type="button"
              onClick={() => {
                setLoad({ status: 'checking' })
                setAttempt((n) => n + 1)
              }}
            >
              Try again
            </button>
          </>
        )}

        {load.status === 'ready' && (
          <>
            {load.several ? (
              <>
                <h1>
                  You're invited to {load.parts[0].invite.organization?.name ?? 'these websites'}
                </h1>
                <ul className="invite-parts">
                  {load.parts.map((part) => (
                    <li key={part.token} className="long-word">
                      {part.invite.siteName} as {part.invite.roleName}
                    </li>
                  ))}
                </ul>
                {load.lost > 0 && (
                  <p role="status" className="notice warning">
                    {load.lost === 1
                      ? 'One part of this invite is no longer valid.'
                      : `${load.lost} parts of this invite are no longer valid.`}
                  </p>
                )}
              </>
            ) : (
              <h1>
                You're invited to {load.parts[0].invite.siteName} as {load.parts[0].invite.roleName}
              </h1>
            )}
            <p className="hint">This invite is for {load.parts[0].invite.email}.</p>
            {session.status === 'signed-in' && (
              <p role="status" className="notice warning">
                You're signed in as {session.user.name}. Joining signs you in as{' '}
                {load.parts[0].invite.email}.
              </p>
            )}
            <form className="form" noValidate onSubmit={join}>
              {!load.parts[0].invite.hasAccount && (
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    ref={nameInput}
                    type="text"
                    autoComplete="name"
                    value={name}
                    aria-invalid={errors.name !== undefined}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {errors.name && (
                    <p id="name-error" className="field-error">
                      {errors.name}
                    </p>
                  )}
                </div>
              )}
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="password-row">
                  <input
                    id="password"
                    ref={passwordInput}
                    type={shown ? 'text' : 'password'}
                    autoComplete={
                      load.parts[0].invite.hasAccount ? 'current-password' : 'new-password'
                    }
                    value={password}
                    aria-invalid={errors.password !== undefined}
                    aria-describedby={
                      [
                        load.parts[0].invite.hasAccount ? null : 'password-hint',
                        errors.password ? 'password-error' : null,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary"
                    aria-pressed={shown}
                    onClick={() => setShown(!shown)}
                  >
                    {shown ? 'Hide' : 'Show'}
                  </button>
                </div>
                {!load.parts[0].invite.hasAccount && (
                  <p id="password-hint" className="hint">
                    At least {PASSWORD_MIN} characters.
                  </p>
                )}
                {errors.password && (
                  <p id="password-error" className="field-error">
                    {errors.password}
                  </p>
                )}
              </div>
              {formError && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              <button type="submit" disabled={busy} aria-busy={busy}>
                {busy
                  ? 'Joining…'
                  : load.parts[0].invite.hasAccount
                    ? 'Sign in and join'
                    : 'Create account and join'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
