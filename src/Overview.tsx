import { Link } from 'react-router'
import type { Membership, User } from './api.ts'
import { listPath } from './helpers.ts'
import { useSignedIn } from './useSignedIn.ts'

type Props = { user: User; membership: Membership }

/** The Dashboard, the first screen after signing in: which site, who you are there, what your role allows, and where to start. */
export default function Overview({ user, membership }: Props) {
  const { canCreate } = useSignedIn()

  return (
    <main>
      <h1>Dashboard</h1>
      <section className="welcome-panel" aria-labelledby="welcome-heading">
        <h2 id="welcome-heading">{membership.site.name}</h2>
        <p>
          Signed in as {user.name} ({user.email}). Your role on this site: {membership.role.name}.
        </p>
        <div className="actions">
          {canCreate && (
            <Link className="button" to="/pages/new?type=page">
              Write a page
            </Link>
          )}
          <Link className="button secondary" to={listPath('page')}>
            See all pages
          </Link>
        </div>
      </section>
      <section className="postbox" aria-labelledby="role-heading">
        <h2 id="role-heading" className="postbox-title">
          Your role
        </h2>
        <div className="postbox-inside">
          <details>
            <summary>What this role allows</summary>
            <ul className="permissions">
              {membership.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    </main>
  )
}
