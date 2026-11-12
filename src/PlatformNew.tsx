import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { InviteLinkBox } from './InviteLink.tsx'
import { describeFailure, formatMoment } from './helpers.ts'
import { inviteLink } from './members-api.ts'
import { createPlatformOrganization } from './platform-api.ts'
import type { OwnerChange } from './platform-api.ts'

/** The API takes 1 to 100 characters once trimmed (api/src/platform-admin/platform-admin.service.ts). */
const MAX_NAME = 100

/**
 * New organization (`/platform/organizations/new`, platform-admin T7, D-062): the organization's name
 * and its owner's email. An email that has an account makes that person the owner at once; a new person
 * also needs a name, and the screen then shows the one-time link to send them (nothing is emailed). The
 * link is shown once: leaving the screen loses it, as the API keeps only a fingerprint.
 */
export default function PlatformNew() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<(OwnerChange & { name: string }) | null>(null)
  const inFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)

  if (made) {
    const { ownerInvitation: link, owner } = made
    return (
      <main>
        <h1>New organization</h1>
        <p role="status" className="notice">
          {made.name} was created.
          {owner && ` ${owner.name} (${owner.email}) is its owner.`}
        </p>
        {link && (
          <InviteLinkBox key={link.token} email={link.email} link={inviteLink(link.token)}>
            <p>
              Send this link to {link.email}. They become the owner. It works once, until{' '}
              {formatMoment(link.expiresAt)}, and this is the only time it is shown.
            </p>
          </InviteLinkBox>
        )}
        <div className="actions">
          <Link className="button" to="/platform/organizations">
            Back to Organizations
          </Link>
        </div>
      </main>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const tidyName = name.trim()
    const tidyEmail = email.trim()
    const found: Record<string, string> = {}
    if (tidyName === '') found.name = 'Enter a name.'
    else if (tidyName.length > MAX_NAME) found.name = `Use ${MAX_NAME} characters or fewer.`
    if (tidyEmail === '') found.ownerEmail = 'Enter the owner’s email address.'
    setProblems(found)
    setFormError(null)
    if (found.name) return void nameInput.current?.focus()
    if (found.ownerEmail) return void emailInput.current?.focus()

    inFlight.current = true
    setBusy(true)
    try {
      setMade(
        await createPlatformOrganization({
          name: tidyName,
          ownerEmail: tidyEmail,
          ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
        }),
      )
    } catch (error) {
      const failure = describeFailure(error, ['name', 'ownerEmail', 'ownerName'])
      setProblems(failure.fields)
      setFormError(failure.form)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <main>
      <Link className="back" to="/platform/organizations">
        ← Organizations
      </Link>
      <h1>New organization</h1>
      <p>
        Make the organization for a client and choose who owns it. The owner then adds its websites and
        people.
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
            aria-invalid={problems.name !== undefined}
            aria-describedby={problems.name ? 'name-error' : undefined}
          />
          {problems.name && (
            <p id="name-error" className="field-error">
              {problems.name}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="owner-email">Owner’s email</label>
          <input
            id="owner-email"
            ref={emailInput}
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={problems.ownerEmail !== undefined}
            aria-describedby={problems.ownerEmail ? 'owner-email-error' : undefined}
          />
          {problems.ownerEmail && (
            <p id="owner-email-error" className="field-error">
              {problems.ownerEmail}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="owner-name">Owner’s name</label>
          <input
            id="owner-name"
            value={ownerName}
            autoComplete="off"
            onChange={(event) => setOwnerName(event.target.value)}
            aria-invalid={problems.ownerName !== undefined}
            aria-describedby="owner-name-hint"
          />
          <p id="owner-name-hint" className="hint">
            Only needed when this email has no account yet.
          </p>
          {problems.ownerName && <p className="field-error">{problems.ownerName}</p>}
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
          <Link className="button secondary" to="/platform/organizations">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
