import { Link, useNavigate } from 'react-router'
import type { Membership } from './api.ts'
import { selectSite } from './session.ts'
import { external, siteUrl } from './site-links.ts'

type Props = { memberships: Membership[]; siteId: string | null }

/** The sites you belong to and your role on each, from your sign-in: nothing is asked of the API here. */
export default function Sites({ memberships, siteId }: Props) {
  const navigate = useNavigate()

  function switchTo(id: string) {
    selectSite(id)
    navigate('/')
  }

  return (
    <main>
      <div className="heading-row">
        <h1>Sites</h1>
        <Link className="button secondary" to="/sites/new">
          Add New Site
        </Link>
      </div>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
