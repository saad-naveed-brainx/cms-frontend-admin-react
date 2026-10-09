import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from './session.ts'

// The same shape the API insists on, so an obvious typo is caught before a request is made.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FAILURES = {
  invalid: 'Email or password is incorrect.',
  unreachable: "Can't reach the server. Check your connection and try again.",
  failed: 'Something went wrong. Try again.',
}

function emailProblem(email: string): string | null {
  if (email === '') return 'Enter your email address.'
  return EMAIL_SHAPE.test(email) ? null : 'Enter a valid email address.'
}

type Props = { notice: string | null }

export default function SignIn({ notice }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const tidyEmail = email.trim()
    const nextEmailError = emailProblem(tidyEmail)
    const nextPasswordError = password === '' ? 'Enter your password.' : null
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    setFormError(null)
    if (nextEmailError) {
      emailInput.current?.focus()
      return
    }
    if (nextPasswordError) {
      passwordInput.current?.focus()
      return
    }

    inFlight.current = true
    setBusy(true)
    const outcome = await signIn(tidyEmail, password)
    inFlight.current = false
    if (outcome === 'ok') return // this screen is replaced by the app

    setBusy(false)
    setPassword('')
    setFormError(FAILURES[outcome])
    passwordInput.current?.focus()
  }

  return (
    <main className="auth">
      <p className="eyebrow">CMS admin</p>
      <h1>Sign in</h1>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <form className="form" noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            ref={emailInput}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailError !== null}
            aria-describedby={emailError ? 'email-error' : undefined}
          />
          {emailError && (
            <p id="email-error" className="field-error">
              {emailError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            ref={passwordInput}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError !== null}
            aria-describedby={passwordError ? 'password-error' : undefined}
          />
          {passwordError && (
            <p id="password-error" className="field-error">
              {passwordError}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
