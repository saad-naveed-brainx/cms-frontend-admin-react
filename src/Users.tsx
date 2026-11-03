import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from './api.ts'
import { formatMoment } from './helpers.ts'
import InviteLink from './InviteLink.tsx'
import {
  cancelInvitation,
  changeRole,
  fetchTeam,
  refusal,
  removeMember,
  renewInvitation,
} from './members-api.ts'
import type { Invitation, IssuedInvitation, Member, Team } from './members-api.ts'
import { reloadProfile } from './session.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; team: Team }

/**
 * "an Editor", "a Contributor". The first letter is enough for the five roles, which are fixed
 * (invariant 8); roles that people could name themselves would need more than this.
 */
const withArticle = (role: string): string => `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`

/**
 * The site's people and waiting invites, all at once (users-roles): for Administrators
 * (`members.manage`; the API decides, admin rule 3). A role saves as soon as it is chosen, Remove
 * asks first, Cancel does not (it is cheap to invite again). An expired invite stays until it is
 * cancelled or given a New link. Changing yourself reloads who you are, so the menu and the Site
 * control follow at once (plan D11).
 */
export default function Users() {
  const { canManageMembers, siteName, userId } = useSignedIn()
  const location = useLocation()
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  /** The role being saved, shown in its box until the answer comes. */
  const [saving, setSaving] = useState<{ userId: string; roleId: string } | null>(null)
  const [issued, setIssued] = useState<IssuedInvitation | null>(null)
  // Removing yourself moves you to another site, which starts this screen afresh: the notice rides in the history entry.
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  )
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!canManageMembers) return
    let cancelled = false
    fetchTeam()
      .then((team) => {
        if (!cancelled) setLoad({ status: 'ready', team })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt, canManageMembers])

  function changeTeam(next: (team: Team) => Team) {
    setLoad((now) => (now.status === 'ready' ? { status: 'ready', team: next(now.team) } : now))
  }

  /** One change at a time: while it runs, every control on the list is disabled. */
  async function run(change: () => Promise<void>) {
    setBusy(true)
    setNotice(null)
    setProblem(null)
    try {
      await change()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setProblem('Someone has already changed this. Here is the list as it is now.')
        setAttempt((n) => n + 1)
      } else {
        setProblem(refusal(error))
      }
    } finally {
      setBusy(false)
      setSaving(null)
    }
  }

  /** After changing yourself: `said` is what the notice says, kept if the reload fails. */
  async function reloadOwnAccess(said: string) {
    try {
      await reloadProfile()
    } catch {
      setNotice(`${said} Reload the page to bring your menu up to date.`)
    }
  }

  function chooseRole(member: Member, roleId: string) {
    setSaving({ userId: member.userId, roleId })
    void run(async () => {
      const changed = await changeRole(member.userId, roleId)
      changeTeam((team) => ({
        ...team,
        members: team.members.map((one) => (one.userId === changed.userId ? changed : one)),
      }))
      const said = `${changed.name} is now ${withArticle(changed.role.name)}.`
      setNotice(said)
      if (changed.userId === userId) await reloadOwnAccess(said)
    })
  }

  function remove(member: Member) {
    if (!window.confirm(`Remove ${member.name} from ${siteName}? Their pages stay.`)) return
    void run(async () => {
      await removeMember(member.userId)
      changeTeam((team) => ({
        ...team,
        members: team.members.filter((one) => one.userId !== member.userId),
      }))
      const said = `${member.name} was removed from ${siteName}.`
      setNotice(said)
      if (member.userId === userId) {
        navigate('/users', { replace: true, state: { notice: said } })
        await reloadOwnAccess(said)
      }
    })
  }

  function newLink(invitation: Invitation) {
    void run(async () => {
      const answer = await renewInvitation(invitation.id)
      changeTeam((team) => ({
        ...team,
        invitations: team.invitations.map((one) =>
          one.id === answer.invitation.id ? answer.invitation : one,
        ),
      }))
      setIssued(answer)
    })
  }

  function cancel(invitation: Invitation) {
    void run(async () => {
      await cancelInvitation(invitation.id)
      changeTeam((team) => ({
        ...team,
        invitations: team.invitations.filter((one) => one.id !== invitation.id),
      }))
      setIssued((shown) => (shown?.invitation.id === invitation.id ? null : shown))
      setNotice(`The invite for ${invitation.email} was cancelled.`)
    })
  }

  const messages = (
    <>
      {notice && (
        <p role="status" className="notice pinned">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="notice error pinned">
          {problem}
        </p>
      )}
    </>
  )

  // Reached by its address, or just after changing your own role.
  if (!canManageMembers) {
    return (
      <main>
        <h1>Users</h1>
        {messages}
        <p className="hint">Only an administrator of this site can manage its users.</p>
      </main>
    )
  }

  return (
    <main>
      <div className="heading-row">
        <h1>Users</h1>
        <Link className="button secondary" to="/users/new">
          Add New
        </Link>
      </div>
      {messages}

      {load.status === 'loading' && <p role="status">Loading users…</p>}
      {load.status === 'failed' && (
        <div className="problem">
          <p role="alert">Couldn’t load the users.</p>
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
      {load.status === 'ready' && (
        <>
          <table className="list-table people" aria-label="People">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {load.team.members.map((member) => (
                <tr key={member.userId}>
                  <td className="title-col">
                    <strong>{member.name}</strong>
                    <div className="hint long-word">{member.email}</div>
                  </td>
                  <td>
                    <div className="member-role">
                      <select
                        aria-label={`Access for ${member.name}`}
                        value={saving?.userId === member.userId ? saving.roleId : member.role.id}
                        disabled={busy}
                        onChange={(event) => chooseRole(member, event.target.value)}
                      >
                        {load.team.roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="secondary small danger"
                        aria-label={`Remove ${member.name}`}
                        disabled={busy}
                        onClick={() => remove(member)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {load.team.invitations.length > 0 && (
            <>
              <h2 id="invites-heading" className="list-heading">
                Waiting invites
              </h2>
              {issued && <InviteLink key={issued.token} issued={issued} renewed />}
              <table className="list-table" aria-labelledby="invites-heading">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">
                      <span className="screen-reader-text">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {load.team.invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td className="title-col">
                        <strong className="long-word">{invitation.email}</strong>
                        <div className="hint">
                          {invitation.expired
                            ? 'Expired'
                            : `Link works until ${formatMoment(invitation.expiresAt)}`}
                        </div>
                      </td>
                      <td>{invitation.role.name}</td>
                      <td className="action-col">
                        <div className="row-buttons">
                          <button
                            type="button"
                            className="secondary small"
                            aria-label={`New link for ${invitation.email}`}
                            disabled={busy}
                            onClick={() => newLink(invitation)}
                          >
                            New link
                          </button>
                          <button
                            type="button"
                            className="secondary small"
                            aria-label={`Cancel the invite for ${invitation.email}`}
                            disabled={busy}
                            onClick={() => cancel(invitation)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </main>
  )
}
