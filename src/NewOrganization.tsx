import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { describeFailure } from './helpers.ts'
import { reloadProfile } from './session.ts'
import { createOrganization } from './sites-api.ts'

/** The API takes 1 to 100 characters once trimmed (api/src/provisioning/tenant-input.ts). */
const MAX_NAME = 100

/**
 * The name of a new organization (organizations T6, D-056). Any signed-in person may make one, and
 * it is theirs. The admin then opens it: it has no website yet, so the next step is Add your first
 * website. About the person, not one site, so it is routed even when they belong to none.
 */
export default function NewOrganization() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The name of an organization that exists now but whose arrival the admin could not confirm. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const inFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)

  if (unconfirmed !== null) {
    return (
      <main>
        <h1>New organization</h1>
        <div className="problem">
          <p role="status">
            “{unconfirmed}” was created, but your list of organizations could not be refreshed.
          </p>
          <button type="button" onClick={() => window.location.assign('/')}>
            Reload
          </button>
        </div>
      </main>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const tidy = name.trim()
    const found =
      tidy === ''
        ? 'Enter a name.'
        : tidy.length > MAX_NAME
          ? `Use ${MAX_NAME} characters or fewer.`
          : null
    setProblem(found)
    setFormError(null)
    if (found !== null) {
      nameInput.current?.focus()
      return
    }

    inFlight.current = true
    setBusy(true)
    try {
      const created = await createOrganization(tidy)
      try {
        await reloadProfile(undefined, created.id)
      } catch {
        setUnconfirmed(created.name)
        return
      }
      navigate('/', { state: { organizationCreated: true } })
    } catch (error) {
      const problems = describeFailure(error, ['name'])
      setProblem(problems.fields.name ?? null)
      setFormError(problems.form)
      if (problems.fields.name) nameInput.current?.focus()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <main>
      <Link className="back" to="/">
        ← Overview
      </Link>
      <h1>New organization</h1>
      <p>
        An organization is a company or a client. Its websites, and the people on them, belong to
        it.
      </p>
      <form className="form" noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            ref={nameInput}
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={problem !== null}
            aria-describedby={problem ? 'name-error' : undefined}
          />
          {problem && (
            <p id="name-error" className="field-error">
              {problem}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Creating…' : 'Create organization'}
          </button>
          <Link className="button secondary" to="/">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
