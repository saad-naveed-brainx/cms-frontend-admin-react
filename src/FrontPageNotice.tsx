import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { createPage, fetchPages, publishPage } from './pages-api.ts'
import type { PageSummary } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

/** The site's front page: the page at this address is what visitors see at `/` (D-037). */
export const FRONT_PAGE_PATH = '/home'

/** What the edit screen says after this notice made the front page. */
export type FrontPageMade = 'published' | 'created'

/** Unknown while asking (or when the question failed: then nothing is said), else the page at `/home` or none. */
type Front = { status: 'unknown' } | { status: 'known'; page: PageSummary | null }

type Props = {
  /** Called after the front page was published here, so a list on the same screen can show it. */
  onChange?: () => void
}

/**
 * Says when the site has no published front page, so its address shows "Page not found", and offers to
 * fix it: make one (titled Home, with the site's name in a hero, published, as a new site starts) or
 * publish the one there is. Nothing is shown while asking, when the question fails, or when all is well.
 */
export default function FrontPageNotice({ onChange }: Props) {
  const { siteId, siteName, canCreate, canPublish } = useSignedIn()
  const navigate = useNavigate()
  const [front, setFront] = useState<Front>({ status: 'unknown' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [published, setPublished] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPages({ path: FRONT_PAGE_PATH, limit: 1, offset: 0 })
      .then((list) => {
        const page = list.items.find((item) => item.path === FRONT_PAGE_PATH) ?? null
        if (!cancelled) setFront({ status: 'known', page })
      })
      .catch(() => {
        // Not knowing is not a problem worth a message: the page list says if pages cannot load.
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  async function create() {
    setBusy(true)
    setProblem(null)
    let made
    try {
      made = await createPage({
        type: 'page',
        title: 'Home',
        slug: 'home',
        blocks: [{ type: 'hero', headline: siteName ?? 'Welcome' }],
      })
    } catch {
      setBusy(false)
      setProblem('Couldn’t create the front page. Try again.')
      return
    }
    let state: FrontPageMade = 'published'
    try {
      await publishPage(made.id)
    } catch {
      state = 'created'
    }
    navigate(`/pages/${made.id}`, { state: { frontPage: state } })
  }

  async function publish(page: PageSummary) {
    setBusy(true)
    setProblem(null)
    try {
      const live = await publishPage(page.id)
      setFront({ status: 'known', page: live })
      setPublished(true)
      onChange?.()
    } catch {
      setProblem('Couldn’t publish the front page. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (published) {
    return (
      <p role="status" className="notice">
        Front page published. Visitors see it at your site’s address.
      </p>
    )
  }
  if (front.status === 'unknown' || front.page?.status === 'published') return null

  const page = front.page
  return (
    <section className="notice warning front-page-notice" aria-labelledby="front-page-heading">
      <h2 id="front-page-heading">
        {page ? 'Your front page is not published' : 'Your site has no front page'}
      </h2>
      <p>
        Visitors to your site’s address see “Page not found”
        {page ? ' until it is published.' : '. The front page is the page at /home.'}
      </p>
      {problem && (
        <p role="alert" className="form-error">
          {problem}
        </p>
      )}
      <div className="actions">
        {!page && canCreate && canPublish && (
          <button type="button" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create the front page'}
          </button>
        )}
        {page && canPublish && (
          <button type="button" disabled={busy} onClick={() => publish(page)}>
            {busy ? 'Publishing…' : 'Publish the front page'}
          </button>
        )}
        {page && (
          <Link className="button secondary" to={`/pages/${page.id}`}>
            Edit it
          </Link>
        )}
      </div>
      {((!page && !(canCreate && canPublish)) || (page && !canPublish)) && (
        <p>
          Ask someone who can publish pages on this site to {page ? 'publish it' : 'create it'}.
        </p>
      )}
    </section>
  )
}
