import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError } from './api.ts'
import { formatMoment } from './helpers.ts'
import { InviteLinkBox } from './InviteLink.tsx'
import { createInvitation, inviteLink, refusal } from './members-api.ts'
import type { IssuedInvitation } from './members-api.ts'
import { fetchOrganizationTeam } from './team-api.ts'
import type { OrganizationTeam, TeamWebsite } from './team-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load =
  | { status: 'loading' }
  | { status: 'failed'; reason: 'forbidden' | 'gone' | 'other' }
  | { status: 'ready'; team: OrganizationTeam }

/** An invitation made for one website; `replaced` says it took the place of a waiting one for the same email. */
type Made = { website: TeamWebsite; issued: IssuedInvitation; replaced: boolean }
type Failure = { website: TeamWebsite; roleId: string; message: string }
/** What the button made: a link for each press that worked (the first, and any retry), and what did not work. */
type Outcome = { email: string; batches: Made[][]; failures: Failure[] }

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "A", "A and B", "A, B and C". */
function joinWords(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/**
 * Add person (`/team/new`, organizations T7, D-055): an email, the websites of the organization it is
 * for, and a role on each, make one invitation per website and one link that carries them all (the
 * secrets joined with a dot after the `#`). Sending the link is the owner's; no email is sent. A
 * website where the email already has access cannot be ticked, and every role starts at the least
 * access. When one website's invitation fails, the link for the ones that were made is shown and the
 * failure is named, with a retry for that website alone. The owner's: anyone else is told so.
 */
export default function AddPerson() {
  const { organizationId, ownsCurrentOrganization } = useSignedIn()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [chosenRoles, setChosenRoles] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<{ email?: string; websites?: string }>({})
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const inFlight = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const firstBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (organizationId === null || !ownsCurrentOrganization) return
    let cancelled = false
    fetchOrganizationTeam(organizationId)
      .then((team) => {
        if (!cancelled) setLoad({ status: 'ready', team })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const status = error instanceof ApiError ? error.status : 0
        setLoad({
          status: 'failed',
          reason: status === 403 ? 'forbidden' : status === 404 ? 'gone' : 'other',
        })
      })
    return () => {
      cancelled = true
    }
  }, [organizationId, ownsCurrentOrganization, attempt])

  if (!ownsCurrentOrganization) {
    return (
      <main>
        <h1>Add person</h1>
        <p className="hint">Add person is for the owner of the organization.</p>
      </main>
    )
  }

  const team = load.status === 'ready' ? load.team : null
  const typed = email.trim().toLowerCase()
  const hasAccess = (site: TeamWebsite) =>
    typed !== '' &&
    (team?.people.some(
      (person) =>
        person.email.toLowerCase() === typed &&
        person.access.some((entry) => entry.siteId === site.id),
    ) ??
      false)
  /** Every role starts at the least access: the last the API lists. */
  const roleFor = (site: TeamWebsite) => chosenRoles[site.id] ?? site.roles.at(-1)?.id ?? ''
  /** Where the focus goes when no website is ticked: the first one that can be, never a disabled box. */
  const firstOpen = team?.websites.find((site) => !hasAccess(site))

  /** Asks again for the team, so the next ask knows what was just made. What is shown stays if it cannot. */
  async function refresh() {
    if (organizationId === null) return
    try {
      setLoad({ status: 'ready', team: await fetchOrganizationTeam(organizationId) })
    } catch {
      // The form and the link stay as they are.
    }
  }

  /** One invitation per website, one after another; a 401 ends the session and the sign-in screen replaces this one. */
  async function run(
    address: string,
    picks: { website: TeamWebsite; roleId: string }[],
    fresh: boolean,
  ) {
    if (team === null || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const made: Made[] = []
    const failures: Failure[] = []
    try {
      for (const pick of picks) {
        try {
          const issued = await createInvitation(
            { email: address, roleId: pick.roleId },
            pick.website.id,
          )
          const replaced = team.invitations.some(
            (waiting) =>
              waiting.siteId === pick.website.id && waiting.email.toLowerCase() === address,
          )
          made.push({ website: pick.website, issued, replaced })
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return
          failures.push({ website: pick.website, roleId: pick.roleId, message: refusal(error) })
        }
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
    setOutcome((before) => ({
      email: address,
      batches: [...(fresh ? [] : (before?.batches ?? [])), ...(made.length > 0 ? [made] : [])],
      failures: [
        ...(fresh
          ? []
          : (before?.failures ?? []).filter(
              (failure) => !picks.some((pick) => pick.website.id === failure.website.id),
            )),
        ...failures,
      ],
    }))
    void refresh()
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (team === null) return
    const found: typeof errors = {}
    if (!EMAIL_SHAPE.test(typed)) found.email = 'Enter a valid email address.'
    const chosen = team.websites.filter((site) => ticked[site.id] === true && !hasAccess(site))
    if (chosen.length === 0) found.websites = 'Choose at least one website.'
    setErrors(found)
    if (found.email) {
      emailInput.current?.focus()
      return
    }
    if (found.websites) {
      firstBox.current?.focus()
      return
    }
    void run(
      typed,
      chosen.map((website) => ({ website, roleId: roleFor(website) })),
      true,
    )
  }

  function addAnother() {
    setOutcome(null)
    setEmail('')
    setTicked({})
    setChosenRoles({})
    setErrors({})
  }

  const showForm = outcome === null || outcome.batches.length === 0

  return (
    <main>
      <Link className="back" to="/team">
        ← Team
      </Link>
      <h1>Add person</h1>

      {load.status === 'loading' && <p role="status">Loading…</p>}
      {load.status === 'failed' && load.reason === 'forbidden' && (
        <p role="alert" className="notice error">
          Only the owner of this organization can add people to it.
        </p>
      )}
      {load.status === 'failed' && load.reason === 'gone' && (
        <p role="alert" className="notice error">
          This organization isn’t available.
        </p>
      )}
      {load.status === 'failed' && load.reason === 'other' && (
        <div className="problem">
          <p role="alert">Couldn’t load the team.</p>
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

      {outcome?.batches.map((batch) => {
        const replaced = batch.filter((made) => made.replaced)
        const soonest = batch.map((made) => made.issued.invitation.expiresAt).sort()[0]
        return (
          <InviteLinkBox
            key={batch.map((made) => made.issued.token).join('.')}
            email={outcome.email}
            link={inviteLink(batch.map((made) => made.issued.token))}
          >
            <p>
              Send this link to them. They join{' '}
              {joinWords(
                batch.map((made) => `${made.website.name} as ${made.issued.invitation.role.name}`),
              )}
              . It works once, until {formatMoment(soonest)}, and this is the only time it is shown.
            </p>
            {replaced.length > 0 && (
              <p>
                The earlier link for {joinWords(replaced.map((made) => made.website.name))} stops
                working.
              </p>
            )}
          </InviteLinkBox>
        )
      })}

      {outcome && outcome.failures.length > 0 && (
        <div className="problem">
          <p role="alert">
            {outcome.batches.length > 0
              ? `The link above does not cover ${joinWords(outcome.failures.map((one) => one.website.name))}.`
              : `No invitation was made for ${joinWords(outcome.failures.map((one) => one.website.name))}.`}
          </p>
          <ul className="team-access">
            {outcome.failures.map((failure) => (
              <li key={failure.website.id}>
                <strong className="long-word">{failure.website.name}</strong>: {failure.message}{' '}
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      outcome.email,
                      [{ website: failure.website, roleId: failure.roleId }],
                      false,
                    )
                  }
                >
                  Try again for {failure.website.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome && outcome.batches.length > 0 && (
        <div className="actions">
          <button type="button" className="secondary" onClick={addAnother}>
            Add another person
          </button>
        </div>
      )}

      {team !== null && team.websites.length === 0 && (
        <p>
          This organization has no websites yet. <Link to="/sites/new">Add a website</Link> first.
        </p>
      )}

      {team !== null && team.websites.length > 0 && showForm && (
        <form className="form" noValidate onSubmit={send}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              ref={emailInput}
              type="email"
              value={email}
              autoComplete="off"
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email ? 'email-hint email-error' : 'email-hint'}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p id="email-hint" className="hint">
              You get one link to send them yourself. Nothing is emailed.
            </p>
            {errors.email && (
              <p id="email-error" className="field-error">
                {errors.email}
              </p>
            )}
          </div>

          <fieldset
            className="group"
            aria-describedby={errors.websites ? 'websites-error' : undefined}
          >
            <legend>Websites</legend>
            {team.websites.map((site) => {
              const already = hasAccess(site)
              return (
                <div className="website-row" key={site.id}>
                  <label className="check">
                    <input
                      ref={site.id === firstOpen?.id ? firstBox : undefined}
                      type="checkbox"
                      checked={ticked[site.id] === true && !already}
                      disabled={already}
                      onChange={(event) =>
                        setTicked((before) => ({ ...before, [site.id]: event.target.checked }))
                      }
                    />
                    <span className="long-word">{site.name}</span>
                  </label>
                  {already ? (
                    <span className="hint">Already has access</span>
                  ) : (
                    <select
                      aria-label={`Role for ${site.name}`}
                      value={roleFor(site)}
                      onChange={(event) =>
                        setChosenRoles((before) => ({ ...before, [site.id]: event.target.value }))
                      }
                    >
                      {site.roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
            {errors.websites && (
              <p id="websites-error" className="field-error">
                {errors.websites}
              </p>
            )}
          </fieldset>

          <div className="sticky-actions">
            <button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Making the link…' : 'Make invite link'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}
