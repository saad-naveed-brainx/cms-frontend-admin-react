import { useEffect, useState } from 'react'
import { ApiError, NetworkError, isRecord } from './api.ts'
import {
  ACCEPTED_TYPES,
  MAX_UPLOAD_BYTES,
  fetchMedia,
  readableSize,
  uploadMedia,
} from './media-api.ts'
import type { MediaItem } from './media-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: MediaItem[]; total: number }

/** Why one file was not added, said with its name. */
function uploadProblem(file: File, error: unknown): string {
  if (error instanceof ApiError && error.status === 413) {
    return `${file.name} is larger than 10 MB.`
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'You can’t add pictures to this site.'
  }
  if (error instanceof ApiError && error.status === 400) {
    const message = isRecord(error.body) ? error.body.message : undefined
    return `${file.name}: ${typeof message === 'string' ? message : 'this file could not be used'}.`
  }
  if (error instanceof NetworkError)
    return `${file.name} was not added: the server could not be reached.`
  return `${file.name} was not added. Try again.`
}

/** A file the API would refuse anyway is explained here, without sending it. */
function checkFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name}: only JPEG, PNG and WebP pictures can be added.`
  }
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than 10 MB.`
  return null
}

/**
 * The site's media library (MED-01/02, D-042), as WordPress's Media Library: the site's pictures,
 * newest first, as a grid of small copies, and "Add New" for those who may upload (`media.upload`).
 * Pictures are chosen for blocks and the logo elsewhere (piece 2).
 */
export default function Media() {
  const { canUpload } = useSignedIn()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [uploading, setUploading] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMedia()
      .then((page) => {
        if (!cancelled) setLoad({ status: 'ready', ...page })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function add(files: File[]) {
    setProblems([])
    setNotice(null)
    const found: string[] = []
    const added: MediaItem[] = []
    for (const [index, file] of files.entries()) {
      const problem = checkFile(file)
      if (problem) {
        found.push(problem)
        continue
      }
      setUploading(
        files.length === 1
          ? `Uploading ${file.name}…`
          : `Uploading ${index + 1} of ${files.length}…`,
      )
      try {
        const item = await uploadMedia(file)
        added.push(item)
        setLoad((now) =>
          now.status === 'ready'
            ? { status: 'ready', items: [item, ...now.items], total: now.total + 1 }
            : now,
        )
      } catch (error) {
        found.push(uploadProblem(file, error))
      }
    }
    setUploading(null)
    setProblems(found)
    if (added.length === 1) setNotice(`${added[0].filename} was added.`)
    else if (added.length > 1) setNotice(`${added.length} pictures were added.`)
  }

  async function showMore() {
    if (load.status !== 'ready') return
    setMore(true)
    try {
      const page = await fetchMedia(load.items.length)
      setLoad((now) =>
        now.status === 'ready'
          ? {
              status: 'ready',
              total: page.total,
              items: [
                ...now.items,
                ...page.items.filter((item) => !now.items.some((had) => had.id === item.id)),
              ],
            }
          : now,
      )
    } catch {
      setProblems(['Couldn’t load more pictures. Try again.'])
    } finally {
      setMore(false)
    }
  }

  return (
    <main>
      <div className="heading-row">
        <h1>Media Library</h1>
        {canUpload && (
          <label className={`button secondary upload-button${uploading ? ' busy' : ''}`}>
            Add New Media File
            <input
              type="file"
              className="screen-reader-text"
              accept={ACCEPTED_TYPES.join(',')}
              multiple
              disabled={uploading !== null}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (files.length > 0) void add(files)
              }}
            />
          </label>
        )}
      </div>
      {canUpload && (
        <p className="hint">
          JPEG, PNG or WebP, up to 10 MB each. Large pictures are made smaller.
        </p>
      )}
      {uploading && <p role="status">{uploading}</p>}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {problems.length > 0 && (
        <div role="alert" className="notice error">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}

      {load.status === 'loading' && <p role="status">Loading pictures…</p>}
      {load.status === 'failed' && (
        <div role="alert" className="notice error">
          <p>Couldn’t load the pictures.</p>
          <button
            type="button"
            className="secondary small"
            onClick={() => {
              setLoad({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}
      {load.status === 'ready' && load.items.length === 0 && (
        <p>No pictures yet.{canUpload ? ' Add one with Add New Media File.' : ''}</p>
      )}
      {load.status === 'ready' && load.items.length > 0 && (
        <>
          <p className="hint">
            {load.total === 1 ? '1 picture' : `${load.total} pictures`}, newest first.
          </p>
          <ul className="media-grid" aria-label="Pictures">
            {load.items.map((item) => (
              <li key={item.id} className="media-item">
                <figure>
                  <div className="media-thumb">
                    <img src={item.thumbUrl} alt={item.filename} loading="lazy" />
                  </div>
                  <figcaption>
                    <span className="media-name">{item.filename}</span>
                    <span className="media-meta">
                      {item.width && item.height ? `${item.width} × ${item.height} · ` : ''}
                      {readableSize(item.sizeBytes)}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
          {load.items.length < load.total && (
            <button
              type="button"
              className="secondary"
              disabled={more}
              onClick={() => void showMore()}
            >
              {more ? 'Loading…' : 'Show more pictures'}
            </button>
          )}
        </>
      )}
    </main>
  )
}
