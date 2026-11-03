import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from './api.ts'
import { formatMoment } from './helpers.ts'
import { selectSite } from './session.ts'
import { fetchOrganizationTeam } from './team-api.ts'
import type { OrganizationTeam } from './team-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load =
  | { status: 'loading' }
  | { status: 'failed'; reason: 'forbidden' | 'gone' | 'other' }
  | { status: 'ready'; team: OrganizationTeam }

const reasonOf = (error: unknown): 'forbidden' | 'gone' | 'other' =>
  error instanceof ApiError && error.status === 403
    ? 'forbidden'
    : error instanceof ApiError && error.status === 404
      ? 'gone'
      : 'other'

/**
 * The company team (`/team`, organizations T7, D-054): everyone on the organization's websites at
 * once, each person once with their websites and roles, and the invitations still waiting. It is the
 * owner's: anyone else who opens the address is told so and nothing is asked of the API. Nothing is
 * changed here: a role or a removal is on that website's Users screen, which each website's name leads to.
 * Keyed by organization by its parent, so another organization is loaded from scratch.
 */
export default function Team() {
  const { organizationId, ownsCurrentOrganization } = useSignedIn()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (organizationId === null || !ownsCurrentOrganization) return
    let cancelled = false
    fetchOrganizationTeam(organizationId)
      .then((team) => {
        if (!cancelled) setLoad({ status: 'ready', team })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'failed', reason: reasonOf(error) })
      })
    return () => {
      cancelled = true
    }
  }, [organizationId, ownsCurrentOrganization, attempt])

  if (!ownsCurrentOrganization) {
    return (
      <main>
        <h1>Team</h1>
        <p className="hint">Team is for the owner of the organization.</p>
      </main>
    )
  }

  return (
    <main>
      <div className="heading-row">
        <h1>Team</h1>
        <Link className="button secondary" to="/team/new">
          Add person
        </Link>
      </div>

      {load.status === 'loading' && <p role="status">Loading…</p>}
      {load.status === 'failed' && load.reason === 'forbidden' && (
        <p role="alert" className="notice error">
          Only the owner of this organization can see its team.
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
      {load.status === 'ready' && <TeamLists team={load.team} />}
    </main>
  )
}

function TeamLists({ team }: { team: OrganizationTeam }) {
  const websites = new Map(team.websites.map((website) => [website.id, website]))

  return (
    <>
      <p>
        <strong className="long-word">{team.organization.name}</strong>: {team.people.length}{' '}
        {team.people.length === 1 ? 'person' : 'people'} on {team.websites.length}{' '}
        {team.websites.length === 1 ? 'website' : 'websites'}. Each person sees only the websites
        listed beside their name.
      </p>

      {team.people.length === 0 ? (
        <p>Nobody is on a website of this organization yet.</p>
      ) : (
        <table className="list-table people" aria-label="People">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Websites and roles</th>
            </tr>
          </thead>
          <tbody>
            {team.people.map((person) => (
              <tr key={person.userId}>
                <td className="title-col">
                  <strong className="long-word">{person.name}</strong>
                  {person.isOwner && <span className="post-state"> Owner</span>}
                  <div className="hint long-word">{person.email}</div>
                </td>
                <td>
                  <ul className="team-access">
                    {person.access.map(({ siteId, role }) => (
                      <li key={siteId}>
                        <Link to="/users" onClick={() => selectSite(siteId)} className="long-word">
                          {websites.get(siteId)?.name ?? 'A website'}
                        </Link>{' '}
                        <span className="post-state">{role.name}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {team.invitations.length > 0 && (
        <>
          <h2 id="team-invites-heading" className="list-heading">
            Waiting invitations
          </h2>
          <table className="list-table" aria-labelledby="team-invites-heading">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Website and role</th>
                <th scope="col">Link</th>
              </tr>
            </thead>
            <tbody>
              {team.invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="title-col">
                    <strong className="long-word">{invitation.email}</strong>
                  </td>
                  <td>
                    <span className="long-word">
                      {websites.get(invitation.siteId)?.name ?? 'A website'}
                    </span>{' '}
                    <span className="post-state">{invitation.role.name}</span>
                  </td>
                  <td>
                    {invitation.expired
                      ? 'Expired'
                      : `Link works until ${formatMoment(invitation.expiresAt)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
