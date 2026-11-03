import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError, problemsOf } from './api.ts'
import type { FormProblems } from './helpers.ts'
import { describeFailure } from './helpers.ts'
import InviteLink from './InviteLink.tsx'
import { apiMessage, createInvitation, fetchTeam } from './members-api.ts'
import type { IssuedInvitation, Role } from './members-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; roles: Role[] }

/** Why an invite was refused. There is one box to type in, so what the API says about it goes there. */
function describeRefusal(error: unknown): FormProblems {
  const refused =
    error instanceof ApiError &&
    (error.status === 409 || (error.status === 400 && problemsOf(error).length === 0))
  const message = apiMessage(error)
  if (refused && message) return { fields: { email: message }, form: null }
  return describeFailure(error, ['email', 'roleId'])
}

/**
 * Add New (`/users/new`): an email and a role make an invite, and the screen becomes its link to
 * copy and send (`InviteLink`). Sending the link is the Administrator's; no email is sent. Inviting
 * someone with a waiting invite replaces it, as the API does. The role starts at the least one, so
 * a click too many gives nobody more than they should have.
 */
export default function AddUser() {
  const { canManageMembers } = useSignedIn()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')
  const [chosenRole, setChosenRole] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<IssuedInvitation | null>(null)

  useEffect(() => {
    if (!canManageMembers) return
    let cancelled = false
    fetchTeam()
      .then((team) => {
        if (!cancelled) setLoad({ status: 'ready', roles: team.roles })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt, canManageMembers])

  const roleId = chosenRole ?? (load.status === 'ready' ? (load.roles.at(-1)?.id ?? '') : '')

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setFormError(null)
    if (email.trim() === '') {
      setErrors({ email: 'Enter an email address.' })
      document.getElementById('email')?.focus()
      return
    }

    setErrors({})
    setBusy(true)
    try {
      setIssued(await createInvitation({ email: email.trim(), roleId }))
    } catch (error) {
      const failure = describeRefusal(error)
      setErrors(failure.fields)
      setFormError(failure.form)
      if (failure.fields.email) document.getElementById('email')?.focus()
    } finally {
      setBusy(false)
    }
  }

  function addAnother() {
    setIssued(null)
    setEmail('')
    setChosenRole(null)
  }

  return (
    <main>
      <Link className="back" to="/users">
        ← All users
      </Link>
      <h1>Add New User</h1>

      {!canManageMembers && (
        <p className="hint">Only an administrator of this site can add users.</p>
      )}
      {canManageMembers && load.status === 'loading' && <p role="status">Loading…</p>}
      {canManageMembers && load.status === 'failed' && (
        <div className="problem">
          <p role="alert">Couldn’t load the site’s roles.</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      {issued && (
        <>
          <InviteLink key={issued.token} issued={issued} />
          <div className="actions">
            <button type="button" className="secondary" onClick={addAnother}>
              Add another person
            </button>
          </div>
        </>
      )}

      {canManageMembers && load.status === 'ready' && !issued && (
        <form className="form" noValidate onSubmit={send}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              autoComplete="off"
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email ? 'email-hint email-error' : 'email-hint'}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p id="email-hint" className="hint">
              You get a link to send them yourself. Nothing is emailed.
            </p>
            {errors.email && (
              <p id="email-error" className="field-error">
                {errors.email}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="roleId">Role</label>
            <select
              id="roleId"
              value={roleId}
              aria-invalid={errors.roleId !== undefined}
              aria-describedby={errors.roleId ? 'roleId-error' : undefined}
              onChange={(event) => setChosenRole(event.target.value)}
            >
              {load.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {errors.roleId && (
              <p id="roleId-error" className="field-error">
                {errors.roleId}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Making the link…' : 'Make invite link'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}
