import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { STATUS_CHOICES, formatDate, pluralLabel, statusLabel } from './helpers.ts'
import { fetchPages, fetchTypes } from './pages-api.ts'
import type { PageList, PageType } from './pages-api.ts'
import { external, siteUrl } from './site-links.ts'
import { useSignedIn } from './useSignedIn.ts'

const PAGE_SIZE = 25

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: PageList }

/** The last answer, and which request it was for: an answer for an older request counts as still loading. */
type Answer = { key: string; list: PageList | null }

/** The site's pages, last changed first. The filters and the page number live in the address, so a reload or a shared link shows the same list. */
export default function PagesList() {
  const { canCreate, siteHost } = useSignedIn()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  // Creating a site lands here, on the new site's own list.
  const [notice] = useState<string | null>(
    (location.state as { siteCreated?: boolean } | null)?.siteCreated ? 'Site created.' : null,
  )
  const type = params.get('type') ?? ''
  const status = params.get('status') ?? ''
  const offset = Math.max(0, Math.floor(Number(params.get('offset'))) || 0)

  const [types, setTypes] = useState<PageType[]>([])
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = [type, status, offset, attempt].join('|')
  const load: Load =
    answer?.key !== requestKey
      ? { status: 'loading' }
      : answer.list
        ? { status: 'ready', list: answer.list }
        : { status: 'error' }

  useEffect(() => {
    fetchTypes()
      .then(setTypes)
      .catch(() => {
        // The type filter then offers only "All types"; the list itself says if it cannot load.
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchPages({
      type: type || undefined,
      status: status || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((list) => {
        if (!cancelled) setAnswer({ key: requestKey, list })
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key: requestKey, list: null })
      })
    return () => {
      cancelled = true
    }
  }, [type, status, offset, requestKey])

  function change(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next)
  }

  const filtered = type !== '' || status !== ''
  const shownType = types.find((item) => item.slug === type)
  // Until the types arrive, the slug stands in for the name ("post" reads "Posts").
  const typeName = shownType?.name ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : null)
  const newPath = type ? `/pages/new?type=${encodeURIComponent(type)}` : '/pages/new'

  return (
    <main>
      <div className="heading-row">
        <h1>{typeName ? pluralLabel(typeName) : 'All content'}</h1>
        {canCreate && (
          <Link className="button secondary" to={newPath}>
            Add New {typeName ?? 'Page'}
          </Link>
        )}
      </div>

      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}

      <div className="tablenav">
        <div className="filters">
          <label htmlFor="type-filter" className="screen-reader-text">
            Type
          </label>
          <select
            id="type-filter"
            value={type}
            onChange={(event) => change({ type: event.target.value, offset: null })}
          >
            <option value="">All types</option>
            {types.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <label htmlFor="status-filter" className="screen-reader-text">
            Status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => change({ status: event.target.value, offset: null })}
          >
            <option value="">All statuses</option>
            {STATUS_CHOICES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {load.status === 'ready' && load.list.items.length > 0 && (
          <div className="tablenav-pages">
            <span className="count">
              Showing {load.list.offset + 1}–{load.list.offset + load.list.items.length} of{' '}
              {load.list.total}
            </span>
            <nav className="pager" aria-label="Pagination">
              <button
                type="button"
                className="secondary small"
                aria-label="Previous"
                disabled={offset === 0}
                onClick={() => change({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
              >
                ‹
              </button>
              <button
                type="button"
                className="secondary small"
                aria-label="Next"
                disabled={offset + PAGE_SIZE >= load.list.total}
                onClick={() => change({ offset: String(offset + PAGE_SIZE) })}
              >
                ›
              </button>
            </nav>
          </div>
        )}
      </div>

      {load.status === 'loading' && <p role="status">Loading pages…</p>}

      {load.status === 'error' && (
        <div className="problem">
          <p role="alert">Couldn't load pages.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      )}

      {load.status === 'ready' && load.list.items.length === 0 && load.list.total === 0 && (
        <div className="problem">
          <p>{filtered ? 'No pages match these filters.' : 'No pages yet.'}</p>
          {!filtered && canCreate && (
            <Link className="button" to={newPath}>
              Create the first page
            </Link>
          )}
        </div>
      )}

      {load.status === 'ready' && load.list.items.length === 0 && load.list.total > 0 && (
        <div className="problem">
          <p>There are no pages this far down the list.</p>
          <button type="button" onClick={() => change({ offset: null })}>
            Back to the first page
          </button>
        </div>
      )}

      {load.status === 'ready' && load.list.items.length > 0 && (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              {!type && (
                <th scope="col" className="hide-narrow">
                  Type
                </th>
              )}
              <th scope="col" className="hide-narrow">
                Address
              </th>
              <th scope="col">Status</th>
              <th scope="col" className="hide-narrow">
                Last changed
              </th>
            </tr>
          </thead>
          <tbody>
            {load.list.items.map((page) => (
              <tr key={page.id}>
                <td className="title-col">
                  <strong>
                    <Link className="row-title" to={`/pages/${page.id}`}>
                      {page.title}
                    </Link>
                    {page.status !== 'published' && (
                      <span className="post-state"> — {statusLabel(page.status)}</span>
                    )}
                  </strong>
                  <div className="row-actions">
                    <Link to={`/pages/${page.id}`}>Edit</Link>
                    {/* Only a published page is on the website; anything else is its 404. */}
                    {page.status === 'published' && siteHost && (
                      <>
                        {' | '}
                        <a href={siteUrl(siteHost, page.path)} {...external}>
                          View
                        </a>
                      </>
                    )}
                  </div>
                </td>
                {!type && <td className="hide-narrow">{page.type.name}</td>}
                <td className="hide-narrow">
                  <code>{page.path}</code>
                </td>
                <td>{statusLabel(page.status)}</td>
                <td className="hide-narrow">{formatDate(page.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
