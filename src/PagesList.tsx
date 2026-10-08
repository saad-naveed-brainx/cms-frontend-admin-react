import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { STATUS_CHOICES, formatDate, statusLabel } from './helpers.ts'
import { fetchPages, fetchTypes } from './pages-api.ts'
import type { PageList, PageType } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

const PAGE_SIZE = 25

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; list: PageList }

/** The last answer, and which request it was for: an answer for an older request counts as still loading. */
type Answer = { key: string; list: PageList | null }

/** The site's pages, last changed first. The filters and the page number live in the address, so a reload or a shared link shows the same list. */
export default function PagesList() {
  const { canCreate } = useSignedIn()
  const [params, setParams] = useSearchParams()
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

  return (
    <main className="wide">
      <div className="heading-row">
        <h1>Pages</h1>
        {canCreate && (
          <Link className="button" to="/pages/new">
            New page
          </Link>
        )}
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="type-filter">Type</label>
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
        </div>
        <div className="field">
          <label htmlFor="status-filter">Status</label>
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
            <Link className="button" to="/pages/new">
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
        <>
          <p className="count">
            Showing {load.list.offset + 1}–{load.list.offset + load.list.items.length} of{' '}
            {load.list.total}
          </p>
          <ul className="pages">
            {load.list.items.map((page) => (
              <li key={page.id}>
                <Link className="page-title" to={`/pages/${page.id}`}>
                  {page.title}
                </Link>
                <span className="meta">
                  {page.type.name} · <code>{page.path}</code> · {statusLabel(page.status)} · Updated{' '}
                  {formatDate(page.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
          <nav className="pager" aria-label="Pagination">
            <button
              type="button"
              className="secondary"
              disabled={offset === 0}
              onClick={() => change({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary"
              disabled={offset + PAGE_SIZE >= load.list.total}
              onClick={() => change({ offset: String(offset + PAGE_SIZE) })}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  )
}
