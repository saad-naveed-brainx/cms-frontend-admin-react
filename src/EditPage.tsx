import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError, isRecord } from './api.ts'
import BlocksEditor from './BlocksEditor.tsx'
import { blockName, draftsFrom, focusField } from './block-drafts.ts'
import type { Draft } from './block-drafts.ts'
import { cleanBlock, sameBlocks, validateBlocks } from './block-schemas.ts'
import { describeFailure, formatDate, listPath, pluralLabel, statusLabel } from './helpers.ts'
import { fetchPage, publishPage, savePage, unpublishPage } from './pages-api.ts'
import type { Page } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Loaded = { status: 'not-found' } | { status: 'error' } | { status: 'ready'; page: Page }

/** The last answer, and which request it was for: an answer for an older request counts as still loading. */
type Answer = { key: string; loaded: Loaded }

/** One page: its title and its blocks change here; its type, address and status are shown, and it can be published. The rest arrives with its own tickets. */
export default function EditPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const { mayEdit, canPublish } = useSignedIn()

  const [answer, setAnswer] = useState<Answer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${id}|${attempt}`
  const load = answer?.key === requestKey ? answer.loaded : null
  const [title, setTitle] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({})
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
        setDrafts(draftsFrom(page.blocks))
        setBlockErrors({})
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
      <main>
        <p role="status">Loading page…</p>
      </main>
    )
  }

  if (load.status === 'not-found') {
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

  if (load.status === 'error') {
    return (
      <main>
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
  const titleChanged = title.trim() !== page.title
  const blocksChanged = !sameBlocks(
    drafts.map((draft) => cleanBlock(draft.block)),
    page.blocks,
  )
  const changed = titleChanged || blocksChanged

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

    const problems = validateBlocks(drafts)
    setBlockErrors(problems)
    const firstProblem = Object.keys(problems)[0]
    if (firstProblem !== undefined) {
      focusField(firstProblem)
      return
    }

    // Only what changed is sent, so a title edit never rewrites the blocks and the other way round.
    const body: { title?: string; blocks?: unknown[] } = {}
    if (titleChanged) body.title = tidyTitle
    if (blocksChanged) body.blocks = drafts.map((draft) => cleanBlock(draft.block))

    inFlight.current = true
    setSaving(true)
    try {
      const saved = await savePage(id, body)
      setAnswer({ key: requestKey, loaded: { status: 'ready', page: saved } })
      setTitle(saved.title)
      // The blocks as stored, in the cards that were on screen, so nothing jumps or loses its place.
      setDrafts((current) =>
        saved.blocks.length === current.length
          ? current.map((draft, at) => {
              const stored: unknown = saved.blocks[at]
              return { key: draft.key, block: isRecord(stored) ? stored : draft.block }
            })
          : draftsFrom(saved.blocks),
      )
      setNotice('Saved.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setAnswer({ key: requestKey, loaded: { status: 'not-found' } })
        return
      }
      const failure = describeFailure(error, ['title'])
      setTitleError(failure.fields.title ?? null)
      setFormError(failure.form)
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
    <main>
      <Link className="back" to={listPath(page.type.slug)}>
        ← {pluralLabel(page.type.name)}
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
      <form className="edit-layout" noValidate onSubmit={save}>
        <div className="edit-main">
          <div className="field title-field">
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
          {editable ? (
            <BlocksEditor
              drafts={drafts}
              errors={blockErrors}
              onChange={(next) => {
                setDrafts(next)
                setNotice(null)
              }}
            />
          ) : (
            <section className="blocks" aria-labelledby="blocks-heading">
              <h2 id="blocks-heading">Blocks</h2>
              {drafts.length === 0 ? (
                <p>No blocks yet.</p>
              ) : (
                <ol>
                  {drafts.map((draft) => (
                    <li key={draft.key}>{blockName(draft.block)}</li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
        <aside className="edit-side">
          <div className="postbox">
            <h2 className="postbox-title">Publish</h2>
            <div className="postbox-inside">
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
                    <>
                      <button
                        type="button"
                        className="secondary inline-action"
                        disabled={statusBusy || changed}
                        onClick={() =>
                          changeStatus(page.status === 'published' ? 'unpublish' : 'publish')
                        }
                      >
                        {page.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      {changed && <span className="hint"> Save your changes first.</span>}
                    </>
                  )}
                </dd>
                <dt>Last changed</dt>
                <dd>{formatDate(page.updatedAt)}</dd>
              </dl>
            </div>
            {(editable || formError) && (
              <div className="postbox-actions">
                {formError && (
                  <p role="alert" className="form-error">
                    {formError}
                  </p>
                )}
                {editable && (
                  <button type="submit" disabled={saving || !changed} aria-busy={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </form>
    </main>
  )
}
