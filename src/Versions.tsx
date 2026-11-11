import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from './api.ts'
import { formatMoment } from './helpers.ts'
import LivePreview from './LivePreview.tsx'
import { fetchPage, fetchVersion, fetchVersions } from './pages-api.ts'
import type { Page, Version, VersionSummary } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

/** How many versions the list asks for at a time. */
const SLICE = 20

type Loaded = { status: 'not-found' } | { status: 'error' } | { status: 'ready'; page: Page }

type Listing =
  | { status: 'loading' }
  | { status: 'failed'; reason: 'forbidden' | 'other' }
  | { status: 'ready'; items: VersionSummary[]; total: number; more: 'idle' | 'busy' | 'failed' }

type Detail = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; version: Version }

const saver = (version: VersionSummary) => version.savedBy?.name ?? 'a former member'

/**
 * A page's versions (`/pages/:id/versions`, version-history T3, D-057): the saved versions newest
 * first, 20 at a time, and a read-only look at the chosen one (its title and search fields as text,
 * its blocks drawn by the preview). **Restore this version** leads to the edit screen, which loads
 * it as unsaved changes (T4, D-058); nothing is written here. Only whoever may edit the page sees it
 * (the API refuses anyone else; this only says so first), and the screen asks the API nothing
 * about versions for anyone who may not.
 */
export default function Versions() {
  const { id = '' } = useParams()
  const { mayEdit, siteTheme } = useSignedIn()

  // Each answer carries the request it was for, so an answer for an older request counts as still loading.
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${id}|${attempt}`
  const [pageAnswer, setPageAnswer] = useState<{ key: string; loaded: Loaded } | null>(null)
  const loaded = pageAnswer?.key === requestKey ? pageAnswer.loaded : null
  const page = loaded?.status === 'ready' ? loaded.page : null
  const allowed = page !== null && mayEdit(page.createdBy)

  const [listAnswer, setListAnswer] = useState<{ key: string; listing: Listing } | null>(null)
  const listing: Listing =
    listAnswer?.key === requestKey ? listAnswer.listing : { status: 'loading' }

  const [chosen, setChosen] = useState<string | null>(null)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const detailKey = chosen === null ? null : `${requestKey}|${chosen}|${detailAttempt}`
  const [detailAnswer, setDetailAnswer] = useState<{ key: string; detail: Detail } | null>(null)
  const detail: Detail =
    detailKey !== null && detailAnswer?.key === detailKey
      ? detailAnswer.detail
      : { status: 'loading' }

  useEffect(() => {
    let cancelled = false
    fetchPage(id)
      .then((found) => {
        if (!cancelled) setPageAnswer({ key: requestKey, loaded: { status: 'ready', page: found } })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const failed: Loaded =
          error instanceof ApiError && error.status === 404
            ? { status: 'not-found' }
            : { status: 'error' }
        setPageAnswer({ key: requestKey, loaded: failed })
      })
    return () => {
      cancelled = true
    }
  }, [id, requestKey])

  // The versions are asked for only once the page says the person may edit it.
  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    fetchVersions(id, { limit: SLICE, offset: 0 })
      .then((slice) => {
        if (cancelled) return
        setListAnswer({
          key: requestKey,
          listing: { status: 'ready', items: slice.items, total: slice.total, more: 'idle' },
        })
        // The newest is the one chosen when the screen opens.
        setChosen(slice.items[0]?.id ?? null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const reason = error instanceof ApiError && error.status === 403 ? 'forbidden' : 'other'
        setListAnswer({ key: requestKey, listing: { status: 'failed', reason } })
      })
    return () => {
      cancelled = true
    }
  }, [id, requestKey, allowed])

  useEffect(() => {
    if (chosen === null || detailKey === null) return
    let cancelled = false
    fetchVersion(id, chosen)
      .then((version) => {
        if (!cancelled) setDetailAnswer({ key: detailKey, detail: { status: 'ready', version } })
      })
      .catch(() => {
        if (!cancelled) setDetailAnswer({ key: detailKey, detail: { status: 'failed' } })
      })
    return () => {
      cancelled = true
    }
  }, [id, chosen, detailKey])

  async function showOlder() {
    if (listing.status !== 'ready' || listing.more === 'busy') return
    const shown = listing.items.length
    setListAnswer({ key: requestKey, listing: { ...listing, more: 'busy' } })
    try {
      const slice = await fetchVersions(id, { limit: SLICE, offset: shown })
      setListAnswer((before) => {
        if (before?.key !== requestKey || before.listing.status !== 'ready') return before
        const had = before.listing.items
        return {
          key: requestKey,
          listing: {
            ...before.listing,
            // A version saved meanwhile moves the offsets: never show one twice.
            items: [
              ...had,
              ...slice.items.filter((one) => !had.some((seen) => seen.id === one.id)),
            ],
            total: slice.total,
            more: 'idle',
          },
        }
      })
    } catch {
      setListAnswer((before) =>
        before?.key === requestKey && before.listing.status === 'ready'
          ? { key: requestKey, listing: { ...before.listing, more: 'failed' } }
          : before,
      )
    }
  }

  if (loaded === null) {
    return (
      <main>
        <p role="status">Loading versions…</p>
      </main>
    )
  }

  if (loaded.status === 'not-found') {
    return (
      <main>
        <h1>Page not found</h1>
        <p>This page is not on this site, or it has been removed.</p>
        <Link className="button" to="/pages">
          Back to pages
        </Link>
      </main>
    )
  }

  if (loaded.status === 'error') {
    return (
      <main>
        <h1>Versions</h1>
        <div className="problem">
          <p role="alert">Couldn’t load this page.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  const back = (
    <Link className="back" to={`/pages/${encodeURIComponent(id)}`}>
      ← Back to editing
    </Link>
  )
  const heading = <h1 className="long-word">Versions of {loaded.page.title}</h1>

  if (!allowed || (listing.status === 'failed' && listing.reason === 'forbidden')) {
    return (
      <main>
        {back}
        {heading}
        <p role="alert" className="notice error">
          You can’t see this page’s versions.
        </p>
      </main>
    )
  }

  if (listing.status === 'failed') {
    return (
      <main>
        {back}
        {heading}
        <div className="problem">
          <p role="alert">Couldn’t load the versions.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (listing.status === 'loading') {
    return (
      <main>
        {back}
        {heading}
        <p role="status">Loading versions…</p>
      </main>
    )
  }

  if (listing.items.length === 0) {
    return (
      <main>
        {back}
        {heading}
        <p>
          No earlier versions yet. The version this page has now is kept the first time it is saved.
        </p>
      </main>
    )
  }

  const { items, total, more } = listing
  const chosenIndex = items.findIndex((item) => item.id === chosen)
  const summary = chosenIndex === -1 ? items[0] : items[chosenIndex]
  const isCurrent = summary.id === items[0].id

  return (
    <main>
      {back}
      {heading}
      <div className="versions">
        <section className="version-list-box" aria-labelledby="versions-heading">
          <h2 id="versions-heading">Saved versions</h2>
          <p className="hint">
            {items.length < total
              ? `Showing ${items.length} of ${total} versions.`
              : `${total} ${total === 1 ? 'version' : 'versions'}`}
          </p>
          <ul className="version-list" aria-label="Saved versions">
            {items.map((item, at) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="version-row"
                  aria-pressed={item.id === summary.id}
                  onClick={() => {
                    setChosen(item.id)
                    // On a phone the chosen version is below the list: bring it into view.
                    document.getElementById('version-heading')?.scrollIntoView({ block: 'nearest' })
                  }}
                >
                  <span className="version-when">{formatMoment(item.savedAt)}</span>
                  <span className="version-who long-word">{saver(item)}</span>
                  {at === 0 && <span className="version-current">Current version</span>}
                </button>
              </li>
            ))}
          </ul>
          {items.length < total &&
            (more === 'failed' ? (
              <div className="problem">
                <p role="alert">Couldn’t load older versions.</p>
                <button type="button" onClick={() => void showOlder()}>
                  Try again
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={more === 'busy'}
                aria-busy={more === 'busy'}
                onClick={() => void showOlder()}
              >
                Show older versions
              </button>
            ))}
        </section>

        <div className="version-view">
          <section className="postbox" aria-labelledby="version-heading">
            <h2 id="version-heading" className="postbox-title">
              Version of {formatMoment(summary.savedAt)}
            </h2>
            <div className="postbox-inside version-facts">
              <p className="hint">
                Saved by {saver(summary)}.{isCurrent && ' This is the version the page has now.'}
              </p>
              {!isCurrent && (
                <div className="actions">
                  <Link
                    className="button"
                    to={`/pages/${encodeURIComponent(id)}?restore=${encodeURIComponent(summary.id)}`}
                  >
                    Restore this version
                  </Link>
                </div>
              )}
              {detail.status === 'loading' && <p role="status">Loading this version…</p>}
              {detail.status === 'failed' && (
                <div className="problem">
                  <p role="alert">Couldn’t load this version.</p>
                  <button type="button" onClick={() => setDetailAttempt((count) => count + 1)}>
                    Try again
                  </button>
                </div>
              )}
              {detail.status === 'ready' && (
                <dl className="facts">
                  <dt>Title</dt>
                  <dd>{detail.version.title}</dd>
                  <dt>Search title</dt>
                  <dd>{detail.version.seoTitle ?? 'Not set'}</dd>
                  <dt>Search description</dt>
                  <dd>{detail.version.seoDescription ?? 'Not set'}</dd>
                  <dt>Canonical address</dt>
                  <dd>{detail.version.canonicalUrl ?? 'Not set'}</dd>
                  <dt>Hidden from search engines</dt>
                  <dd>{detail.version.noIndex ? 'Yes' : 'No'}</dd>
                </dl>
              )}
            </div>
          </section>
          {detail.status === 'ready' && (
            <LivePreview
              blocks={detail.version.blocks}
              theme={siteTheme}
              heading="This version, as visitors would see it"
              frameTitle="Preview of this version"
              emptyNote="This version has no blocks."
            />
          )}
        </div>
      </div>
    </main>
  )
}
