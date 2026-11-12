import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { InviteLinkBox } from './InviteLink.tsx'
import { describeFailure, formatMoment } from './helpers.ts'
import { inviteLink } from './members-api.ts'
import {
  changeOrganizationOwner,
  deletePlatformOrganization,
  fetchPlatformOrganizations,
  setOrganizationSuspended,
} from './platform-api.ts'
import type { OwnerLink, PlatformOrganization } from './platform-api.ts'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: PlatformOrganization[] }

const STATUS_WORDS = { active: 'Active', suspended: 'Suspended', awaiting_owner: 'Awaiting owner' }

/**
 * The Platform section's Organizations screen (`/platform/organizations`, platform-admin T7, D-062):
 * every organization with its owner, how many websites it has and its status, and what the super admin
 * may do to it: suspend or reactivate, change the owner, delete for good (the name typed). Nothing inside
 * an organization is shown or changed from here. One change at a time: every control is disabled while
 * one runs.
 */
export default function Platform() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [owning, setOwning] = useState<PlatformOrganization | null>(null)
  const [deleting, setDeleting] = useState<PlatformOrganization | null>(null)
  const [link, setLink] = useState<OwnerLink | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPlatformOrganizations()
      .then((items) => {
        if (!cancelled) setLoad({ status: 'ready', items })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = () => setAttempt((count) => count + 1)

  async function toggle(organization: PlatformOrganization) {
    const suspend = organization.status !== 'suspended'
    setBusy(true)
    setNotice(null)
    setLink(null)
    try {
      await setOrganizationSuspended(organization.id, suspend)
      setNotice(`${organization.name} was ${suspend ? 'suspended' : 'reactivated'}.`)
      reload()
    } catch {
      setNotice(`Couldn’t ${suspend ? 'suspend' : 'reactivate'} ${organization.name}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>Organizations</h1>
      <p>
        Every organization on the platform. You create them and choose their owners; what is inside an
        organization is its owner’s.{' '}
        <Link className="button" to="/platform/organizations/new">
          Add New
        </Link>
      </p>

      {notice && (
        <p role="status" className="notice pinned">
          {notice}
        </p>
      )}
      {link && (
        <InviteLinkBox key={link.token} email={link.email} link={inviteLink(link.token)}>
          <p>
            Send this link to {link.email}. They become the owner. It works once, until{' '}
            {formatMoment(link.expiresAt)}, and this is the only time it is shown.
          </p>
        </InviteLinkBox>
      )}

      {load.status === 'loading' && <p role="status">Loading…</p>}
      {load.status === 'failed' && (
        <div className="problem">
          <p role="alert">Couldn’t load the organizations.</p>
          <button type="button" onClick={reload}>
            Try again
          </button>
        </div>
      )}
      {load.status === 'ready' && load.items.length === 0 && (
        <p>
          There are no organizations yet. <Link to="/platform/organizations/new">Add the first one.</Link>
        </p>
      )}
      {load.status === 'ready' && load.items.length > 0 && (
        <table className="list-table" aria-label="Organizations">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Owner</th>
              <th scope="col">Websites</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {load.items.map((organization) => (
              <tr key={organization.id}>
                <td className="title-col">
                  <strong className="long-word">{organization.name}</strong>{' '}
                  <span className="post-state">{STATUS_WORDS[organization.status]}</span>
                </td>
                <td>
                  {organization.owner ? (
                    <>
                      <span className="long-word">{organization.owner.name}</span>
                      <div className="hint long-word">{organization.owner.email}</div>
                      {organization.pendingOwnerEmail && (
                        <div className="hint long-word">
                          Handover waiting for {organization.pendingOwnerEmail}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="long-word">
                      Awaiting owner
                      {organization.pendingOwnerEmail && (
                        <span className="hint"> ({organization.pendingOwnerEmail})</span>
                      )}
                    </span>
                  )}
                </td>
                <td>{organization.websites}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    aria-label={`${organization.status === 'suspended' ? 'Reactivate' : 'Suspend'} ${organization.name}`}
                    onClick={() => void toggle(organization)}
                  >
                    {organization.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    aria-label={`Change owner of ${organization.name}`}
                    onClick={() => {
                      setOwning(organization)
                      setDeleting(null)
                      setLink(null)
                    }}
                  >
                    Change owner
                  </button>{' '}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    aria-label={`Delete ${organization.name}`}
                    onClick={() => {
                      setDeleting(organization)
                      setOwning(null)
                      setLink(null)
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {owning && (
        <ChangeOwner
          key={owning.id}
          organization={owning}
          onDone={(done, issued) => {
            setOwning(null)
            setLink(issued)
            setNotice(done)
            reload()
          }}
          onCancel={() => setOwning(null)}
          setBusy={setBusy}
          busy={busy}
        />
      )}
      {deleting && (
        <DeleteOrganization
          key={deleting.id}
          organization={deleting}
          onDone={(done) => {
            setDeleting(null)
            setNotice(done)
            reload()
          }}
          onCancel={() => setDeleting(null)}
          setBusy={setBusy}
          busy={busy}
        />
      )}
    </main>
  )
}

type PanelProps = {
  organization: PlatformOrganization
  busy: boolean
  setBusy: (busy: boolean) => void
  onCancel: () => void
}

function ChangeOwner({
  organization,
  busy,
  setBusy,
  onCancel,
  onDone,
}: PanelProps & { onDone: (notice: string, link: OwnerLink | null) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [removeOld, setRemoveOld] = useState(false)
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const tidy = email.trim()
    if (tidy === '') {
      setProblems({ ownerEmail: 'Enter an email address.' })
      emailInput.current?.focus()
      return
    }
    inFlight.current = true
    setBusy(true)
    setProblems({})
    setFormError(null)
    try {
      const body = { ownerEmail: tidy, removeOld, ...(name.trim() ? { ownerName: name.trim() } : {}) }
      const changed = await changeOrganizationOwner(organization.id, body)
      onDone(
        changed.owner
          ? `${changed.owner.name} is now the owner of ${organization.name}.`
          : `A link was made for the new owner of ${organization.name}. The owner stays as it is until it is used.`,
        changed.ownerInvitation,
      )
    } catch (error) {
      const found = describeFailure(error, ['ownerEmail', 'ownerName'])
      setProblems(found.fields)
      setFormError(found.form)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <section className="postbox" aria-labelledby="change-owner-heading">
      <h2 id="change-owner-heading" className="postbox-title">
        Change owner of {organization.name}
      </h2>
      <form className="postbox-inside form" noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="owner-email">New owner’s email</label>
          <input
            id="owner-email"
            ref={emailInput}
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={problems.ownerEmail !== undefined}
          />
          {problems.ownerEmail && <p className="field-error">{problems.ownerEmail}</p>}
        </div>
        <div className="field">
          <label htmlFor="owner-name">Name (only for a new person)</label>
          <input
            id="owner-name"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={problems.ownerName !== undefined}
          />
          {problems.ownerName && <p className="field-error">{problems.ownerName}</p>}
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={removeOld}
            onChange={(event) => setRemoveOld(event.target.checked)}
          />{' '}
          Remove the old owner from the organization’s websites
        </label>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Changing…' : 'Change owner'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

function DeleteOrganization({
  organization,
  busy,
  setBusy,
  onCancel,
  onDone,
}: PanelProps & { onDone: (notice: string) => void }) {
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const inFlight = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  async function remove() {
    if (inFlight.current || typed.trim() !== organization.name) return
    inFlight.current = true
    setBusy(true)
    setProblem(null)
    try {
      await deletePlatformOrganization(organization.id, typed.trim())
      onDone(`${organization.name} was deleted.`)
    } catch {
      setProblem('Couldn’t delete the organization. Try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <section className="postbox delete-site" aria-labelledby="delete-organization-heading">
      <h2 id="delete-organization-heading" className="postbox-title">
        Delete {organization.name}?
      </h2>
      <div className="postbox-inside">
        <p>
          This deletes the organization for good: its {organization.websites}{' '}
          {organization.websites === 1 ? 'website' : 'websites'}, all their pages and pictures, and
          everyone’s access to them. People’s accounts stay. It cannot be undone.
        </p>
        <div className="field">
          <label htmlFor="confirm-organization-name">
            Type <strong>{organization.name}</strong> to confirm
          </label>
          <input
            id="confirm-organization-name"
            ref={input}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void remove()
              if (event.key === 'Escape') onCancel()
            }}
          />
        </div>
        {problem && (
          <p role="alert" className="form-error">
            {problem}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="danger"
            disabled={busy || typed.trim() !== organization.name}
            onClick={() => void remove()}
          >
            {busy ? 'Deleting…' : 'Delete this organization'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}
