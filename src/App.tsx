import { useLocation } from 'react-router'
import CannotCheck from './CannotCheck.tsx'
import Invite from './Invite.tsx'
import Shell from './Shell.tsx'
import SignIn from './SignIn.tsx'
import { useSession } from './session.ts'

/**
 * The session decides what is on screen, and `react-router` does the rest inside the signed-in frame.
 * The one page that comes before the session is the invite page (`/invite#<secret>`): a link someone
 * was sent opens it whether or not anyone is signed in here.
 */
export default function App() {
  const state = useSession()
  const { pathname, hash } = useLocation()

  // Keyed by the secret: another link typed over this one in the address bar starts the page afresh.
  if (pathname === '/invite') return <Invite key={hash} />

  switch (state.status) {
    case 'checking':
      return (
        <main className="auth">
          <p role="status">Checking your session…</p>
        </main>
      )
    case 'signed-out':
      return <SignIn notice={state.notice} />
    case 'cannot-check':
      return <CannotCheck />
    case 'signed-in':
      return (
        <Shell
          user={state.user}
          memberships={state.memberships}
          organizations={state.organizations}
          organizationId={state.organizationId}
          siteId={state.siteId}
        />
      )
  }
}
