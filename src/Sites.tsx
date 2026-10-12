import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from './api.ts'
import type { Membership } from './api.ts'
import { reloadProfile, selectSite } from './session.ts'
import { external, siteUrl } from './site-links.ts'
import { deleteSite } from './sites-api.ts'

type Props = { memberships: Membership[]; siteId: string | null }

/**
 * The sites you belong to and your role on each, from your sign-in. A site whose organisation you
 * own can be deleted here, for good, after typing its name (D-039).
 */
export default function Sites({ memberships, siteId }: Props) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<Membership['site'] | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (confirming) nameInput.current?.focus()
  }, [confirming])

  function switchTo(id: string) {
    selectSite(id)
    navigate('/')
  }

  function askToDelete(site: Membership['site']) {
    setConfirming(site)
    setTyped('')
    setProblem(null)
    setNotice(null)
  }

  function cancel() {
    setConfirming(null)
    setProblem(null)
  }

  async function remove() {
    if (!confirming || busy || typed.trim() !== confirming.name) return
    setBusy(true)
    setProblem(null)
    try {
      await deleteSite(confirming.id)
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError && error.status === 403) {
        setProblem('Only the owner of the organisation can delete this site.')
      } else if (error instanceof ApiError && error.status === 404) {
        setProblem('This site no longer exists.')
        void reloadProfile().catch(() => {
          // The list stays as it was; a reload of the page brings it up to date.
        })
      } else {
        setProblem('Couldn’t delete the site. Try again.')
      }
      return
    }

    const name = confirming.name
    setConfirming(null)
    setBusy(false)
    setNotice(`${name} was deleted.`)
    // The list, the Site control and, if it was the one being worked on, the current site follow.
    try {
      await reloadProfile()
    } catch {
      setNotice(`${name} was deleted. Reload the page to bring your list of sites up to date.`)
    }
  }

  return (
    <main>
      <div className="heading-row">
        <h1>Sites</h1>
        <Link className="button secondary" to="/sites/new">
          Add New Site
        </Link>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {memberships.length === 0 ? (
        <p>Your account is not a member of any site yet.</p>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col" className="hide-narrow">
                Address
              </th>
              <th scope="col">Your role</th>
              <th scope="col">
                <span className="screen-reader-text">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((membership) => (
              <tr key={membership.site.id}>
                <td className="title-col">
                  <strong>{membership.site.name}</strong>
                  {membership.site.primaryHost && (
                    <div className="row-actions">
                      <a href={siteUrl(membership.site.primaryHost)} {...external}>
                        Visit {membership.site.name}
                      </a>
                    </div>
                  )}
                </td>
                <td className="hide-narrow">
                  {membership.site.primaryHost ? <code>{membership.site.primaryHost}</code> : '—'}
                </td>
                <td>{membership.role.name}</td>
                <td className="action-col">
                  <div className="row-buttons">
                    {membership.site.id === siteId ? (
                      <span className="post-state">Current site</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => switchTo(membership.site.id)}
                      >
                        Switch to {membership.site.name}
                      </button>
                    )}
                    {membership.ownsOrganization && (
                      <button
                        type="button"
                        className="secondary small danger"
                        aria-label={`Delete ${membership.site.name}`}
                        disabled={busy}
                        onClick={() => askToDelete(membership.site)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirming && (
        <section className="postbox delete-site" aria-labelledby="delete-site-heading">
          <h2 id="delete-site-heading" className="postbox-title">
            Delete {confirming.name}?
          </h2>
          <div className="postbox-inside">
            <p>
              This deletes the site for good: all its pages, its web address
              {confirming.primaryHost && (
                <>
                  {' '}
                  (<code>{confirming.primaryHost}</code>)
                </>
              )}{' '}
              and everyone’s access to it. It cannot be undone.
            </p>
            <div className="field">
              <label htmlFor="confirm-site-name">
                Type <strong>{confirming.name}</strong> to confirm
              </label>
              <input
                id="confirm-site-name"
                ref={nameInput}
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void remove()
                  if (event.key === 'Escape') cancel()
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
                disabled={busy || typed.trim() !== confirming.name}
                onClick={() => void remove()}
              >
                {busy ? 'Deleting…' : 'Delete this site'}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
