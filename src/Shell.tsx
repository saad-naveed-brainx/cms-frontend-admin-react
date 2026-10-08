import type { Membership, User } from './api.ts'
import { selectSite, signOut } from './session.ts'

type Props = { user: User; memberships: Membership[]; siteId: string | null }

/** The signed-in frame: who you are, which site you are working on, and what your role there allows. */
export default function Shell({ user, memberships, siteId }: Props) {
  const current = memberships.find((membership) => membership.site.id === siteId) ?? null

  return (
    <>
      <header className="bar">
        <span className="brand">CMS admin</span>
        {memberships.length > 1 && siteId !== null ? (
          <div className="switcher">
            <label htmlFor="site">Site</label>
            <select id="site" value={siteId} onChange={(event) => selectSite(event.target.value)}>
              {memberships.map((membership) => (
                <option key={membership.site.id} value={membership.site.id}>
                  {membership.site.name} · {membership.role.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          current && <span className="site-name">{current.site.name}</span>
        )}
        <span className="user">{user.name}</span>
        <button type="button" className="secondary" onClick={() => signOut()}>
          Sign out
        </button>
      </header>
      {current ? (
        <main>
          <h1>{current.site.name}</h1>
          <p>
            Signed in as {user.name} ({user.email}). Your role on this site: {current.role.name}.
          </p>
          <details>
            <summary>What this role allows</summary>
            <ul className="permissions">
              {current.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </details>
        </main>
      ) : (
        <main>
          <h1>No sites yet</h1>
          <p>Your account is not a member of any site. Ask an administrator to add you.</p>
        </main>
      )}
    </>
  )
}
