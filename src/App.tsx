import CannotCheck from './CannotCheck.tsx'
import Shell from './Shell.tsx'
import SignIn from './SignIn.tsx'
import { useSession } from './session.ts'

/** No router yet: the session decides what is on screen. `CNT-02` brings the first real destinations. */
export default function App() {
  const state = useSession()

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
      return <Shell user={state.user} memberships={state.memberships} siteId={state.siteId} />
  }
}
