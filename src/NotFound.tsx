import { Link } from 'react-router'

/** An address the admin has no screen for. */
export default function NotFound() {
  return (
    <main>
      <h1>Not found</h1>
      <p>There is nothing at this address.</p>
      <Link className="button" to="/">
        Go to the Dashboard
      </Link>
    </main>
  )
}
