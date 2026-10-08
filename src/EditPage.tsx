import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from './api.ts'
import { describeFailure, formatDate, statusLabel } from './helpers.ts'
import { fetchPage, publishPage, savePage, unpublishPage } from './pages-api.ts'
import type { Page } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Loaded = { status: 'not-found' } | { status: 'error' } | { status: 'ready'; page: Page }

/** The last answer, and which request it was for: an answer for an older request counts as still loading. */
type Answer = { key: string; loaded: Loaded }

/** One page: its title can change here; its type, address, status and blocks are shown. The rest arrives with its own tickets. */
export default function EditPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const { mayEdit, canPublish } = useSignedIn()

  const [answer, setAnswer] = useState<Answer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${id}|${attempt}`
  const load = answer?.key === requestKey ? answer.loaded : null
  const [title, setTitle] = useState('')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(
    (location.state as { created?: boolean } | null)?.created ? 'Page created.' : null,
  )
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchPage(id)
      .then((page) => {
        if (cancelled) return
        setAnswer({ key: requestKey, loaded: { status: 'ready', page } })
        setTitle(page.title)
      })
      .catch((error) => {
        if (cancelled) return
        const loaded: Loaded =
          error instanceof ApiError && error.status === 404
            ? { status: 'not-found' }
            : { status: 'error' }
        setAnswer({ key: requestKey, loaded })
      })
    return () => {
      cancelled = true
    }
  }, [id, requestKey])

  if (load === null) {
    return (
      <main className="wide">
        <p role="status">Loading page…</p>
      </main>
    )
  }

  if (load.status === 'not-found') {
    return (
      <main className="wide">
        <h1>Page not found</h1>
        <p>This page is not on this site, or it has been removed.</p>
        <Link className="button" to="/pages">
          Back to pages
        </Link>
      </main>
    )
  }

  if (load.status === 'error') {
    return (
      <main className="wide">
        <h1>Page</h1>
        <div className="problem">
          <p role="alert">Couldn't load this page.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  const { page } = load
  const editable = mayEdit(page.createdBy)
  const changed = title.trim() !== page.title

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !editable) return

    const tidyTitle = title.trim()
    setNotice(null)
    setFormError(null)
    if (tidyTitle === '') {
      setTitleError('Enter a title.')
      titleInput.current?.focus()
      return
    }
    if (tidyTitle.length > 200) {
      setTitleError('Use 200 characters or fewer.')
      titleInput.current?.focus()
      return
    }
    setTitleError(null)

    inFlight.current = true
    setSaving(true)
    try {
      const saved = await savePage(id, { title: tidyTitle })
      setAnswer({ key: requestKey, loaded: { status: 'ready', page: saved } })
      setTitle(saved.title)
      setNotice('Saved.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setAnswer({ key: requestKey, loaded: { status: 'not-found' } })
        return
      }
      const problems = describeFailure(error, ['title'])
      setTitleError(problems.fields.title ?? null)
      setFormError(problems.form)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function changeStatus(action: 'publish' | 'unpublish') {
    if (inFlight.current) return
    inFlight.current = true
    setStatusBusy(true)
    setNotice(null)
    setFormError(null)
    try {
      const changedPage = await (action === 'publish' ? publishPage(id) : unpublishPage(id))
      setAnswer({ key: requestKey, loaded: { status: 'ready', page: changedPage } })
      setNotice(action === 'publish' ? 'Published.' : 'Unpublished.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setAnswer({ key: requestKey, loaded: { status: 'not-found' } })
        return
      }
      setFormError(
        error instanceof ApiError && error.status === 409
          ? 'This page is not published.'
          : describeFailure(error, []).form,
      )
    } finally {
      inFlight.current = false
      setStatusBusy(false)
    }
  }

  return (
    <main className="wide">
      <Link className="back" to="/pages">
        ← Pages
      </Link>
      <h1>{page.title}</h1>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!editable && (
        <p role="status" className="notice">
          You can read this page but not change it.
        </p>
      )}
      <form className="form" noValidate onSubmit={save}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            ref={titleInput}
            value={title}
            readOnly={!editable}
            onChange={(event) => {
              setTitle(event.target.value)
              setNotice(null)
            }}
            aria-invalid={titleError !== null}
            aria-describedby={titleError ? 'title-error' : undefined}
          />
          {titleError && (
            <p id="title-error" className="field-error">
              {titleError}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        {editable && (
          <div className="actions">
            <button type="submit" disabled={saving || !changed} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>
      <dl className="facts">
        <dt>Type</dt>
        <dd>{page.type.name}</dd>
        <dt>Address</dt>
        <dd>
          <code>{page.path}</code>
        </dd>
        <dt>Status</dt>
        <dd>
          {statusLabel(page.status)}
          {canPublish && (
            <button
              type="button"
              className="secondary inline-action"
              disabled={statusBusy}
              onClick={() => changeStatus(page.status === 'published' ? 'unpublish' : 'publish')}
            >
              {page.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
          )}
        </dd>
        <dt>Last changed</dt>
        <dd>{formatDate(page.updatedAt)}</dd>
        <dt>Blocks</dt>
        <dd>
          {page.blocks.length} {page.blocks.length === 1 ? 'block' : 'blocks'}. The block editor
          comes later.
        </dd>
      </dl>
    </main>
  )
}
