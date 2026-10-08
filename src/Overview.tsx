import type { Membership, User } from './api.ts'

type Props = { user: User; membership: Membership }

/** The first screen after signing in: which site, who you are there, and what your role allows. */
export default function Overview({ user, membership }: Props) {
  return (
    <main>
      <h1>{membership.site.name}</h1>
      <p>
        Signed in as {user.name} ({user.email}). Your role on this site: {membership.role.name}.
      </p>
      <details>
        <summary>What this role allows</summary>
        <ul className="permissions">
          {membership.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </details>
    </main>
  )
}
