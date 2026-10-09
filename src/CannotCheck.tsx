import { retry, signOut } from './session.ts'

/** A saved session exists, but the server could not say whether it is still good. Nobody is signed out for that. */
export default function CannotCheck() {
  return (
    <main className="auth">
      <p className="login-logo">CMS admin</p>
      <div className="login-box">
        <h1>We couldn't check your session</h1>
        <p role="alert">Your session is still saved. Check your connection and try again.</p>
        <div className="actions">
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
          <button type="button" className="secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
