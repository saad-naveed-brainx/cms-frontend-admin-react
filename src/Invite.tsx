import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { acceptInvite, lookupInvite } from './invites-api.ts'
import type { InviteDetails } from './invites-api.ts'
import { startSession, useSession } from './session.ts'

/** The API's rule for a new password (api/src/invitations/invitations.service.ts). */
const PASSWORD_MIN = 12

type Load =
  | { status: 'checking' }
  | { status: 'dead' }
  | { status: 'cannot-check' }
  | { status: 'ready'; invite: InviteDetails }

/**
 * The page an invite link opens (`/invite#<secret>`). It is shown before anyone is signed in, and
 * whoever is signed in does not matter yet: someone with no account makes one (a name and a
 * password), someone with an account signs in with its password, and either way they land on the
 * site they were invited to. The secret is read from the `#` part of the address, which never
 * reaches a server or a log, and the address loses it once they have joined. Joining while someone
 * else is signed in here replaces that session, and the page says so first.
 */
export default function Invite() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const token = hash.replace(/^#/, '')
  const [load, setLoad] = useState<Load>(token === '' ? { status: 'dead' } : { status: 'checking' })
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
    if (token === '') return
    let cancelled = false
    void lookupInvite(token).then((answer) => {
      if (cancelled) return
      setLoad(answer.status === 'valid' ? { status: 'ready', invite: answer.invite } : answer)
    })
    return () => {
      cancelled = true
    }
  }, [token, attempt])

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (load.status !== 'ready' || inFlight.current) return
    const { invite } = load

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
    const outcome = await acceptInvite(token, password, invite.hasAccount ? undefined : name.trim())
    inFlight.current = false
    setBusy(false)

    switch (outcome.status) {
      case 'joined':
        startSession(outcome.result, invite)
        navigate('/', { replace: true })
        return
      case 'dead':
        setLoad({ status: 'dead' })
        return
      case 'has-account':
        // The email got an account after this page opened: the same invite, now asking for its password.
        setLoad({ status: 'ready', invite: { ...invite, hasAccount: true } })
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
            <h1>
              You're invited to {load.invite.siteName} as {load.invite.roleName}
            </h1>
            <p className="hint">This invite is for {load.invite.email}.</p>
            {session.status === 'signed-in' && (
              <p role="status" className="notice warning">
                You're signed in as {session.user.name}. Joining signs you in as {load.invite.email}.
              </p>
            )}
            <form className="form" noValidate onSubmit={join}>
              {!load.invite.hasAccount && (
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
                    autoComplete={load.invite.hasAccount ? 'current-password' : 'new-password'}
                    value={password}
                    aria-invalid={errors.password !== undefined}
                    aria-describedby={
                      [
                        load.invite.hasAccount ? null : 'password-hint',
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
                {!load.invite.hasAccount && (
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
                {busy ? 'Joining…' : load.invite.hasAccount ? 'Sign in and join' : 'Create account and join'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
