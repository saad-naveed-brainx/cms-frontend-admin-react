import { useEffect, useId, useRef, useState } from 'react'
import { ApiError, isRecord } from './api.ts'
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, fetchMedia, uploadMedia } from './media-api.ts'
import type { MediaItem } from './media-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Props = {
  /** The window's heading: "Choose a picture", "Choose a logo". */
  title: string
  onChoose: (item: MediaItem) => void
  onClose: () => void
}

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: MediaItem[]; total: number }

/**
 * A window over the screen for choosing one of the site's pictures (MED-03): the media library's
 * grid, newest first, where clicking a picture chooses it. With `media.upload` a new picture can be
 * added from here too, and is chosen at once. Escape or Cancel closes it with nothing chosen.
 *
 * It is open while it is shown: render it only while choosing (`{choosing && <MediaPicker … />}`),
 * so each opening starts afresh and asks for the library again.
 */
export default function MediaPicker({ title, onChoose, onClose }: Props) {
  const { canUpload } = useSignedIn()
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => element?.close()
  }, [])

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
  }, [])

  async function upload(file: File) {
    setProblem(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setProblem(`${file.name}: only JPEG, PNG and WebP pictures can be added.`)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProblem(`${file.name} is larger than 10 MB.`)
      return
    }
    setBusy(`Uploading ${file.name}…`)
    try {
      onChoose(await uploadMedia(file))
    } catch (error) {
      const message =
        error instanceof ApiError && isRecord(error.body) && typeof error.body.message === 'string'
          ? `${file.name}: ${error.body.message}.`
          : `${file.name} was not added. Try again.`
      setProblem(message)
    } finally {
      setBusy(null)
    }
  }

  async function showMore() {
    if (load.status !== 'ready') return
    try {
      const page = await fetchMedia(load.items.length)
      setLoad({
        status: 'ready',
        total: page.total,
        items: [
          ...load.items,
          ...page.items.filter((item) => !load.items.some((had) => had.id === item.id)),
        ],
      })
    } catch {
      setProblem('Couldn’t load more pictures. Try again.')
    }
  }

  return (
    <dialog
      ref={dialog}
      className="media-picker"
      aria-labelledby={headingId}
      // Escape closes the window: the screen stops showing it.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="media-picker-bar">
        <h2 id={headingId}>{title}</h2>
        <button type="button" className="secondary small" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="media-picker-body">
        {canUpload && (
          <p className="media-picker-upload">
            <label className={`button secondary upload-button${busy ? ' busy' : ''}`}>
              Upload a new picture
              <input
                type="file"
                className="screen-reader-text"
                accept={ACCEPTED_TYPES.join(',')}
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void upload(file)
                }}
              />
            </label>
            <span className="hint">JPEG, PNG or WebP, up to 10 MB. It is chosen once added.</span>
          </p>
        )}
        {busy && <p role="status">{busy}</p>}
        {problem && (
          <p role="alert" className="form-error">
            {problem}
          </p>
        )}
        {load.status === 'loading' && <p role="status">Loading pictures…</p>}
        {load.status === 'failed' && (
          <p role="alert" className="form-error">
            Couldn’t load the pictures. Close this and try again.
          </p>
        )}
        {load.status === 'ready' && load.items.length === 0 && (
          <p>No pictures yet.{canUpload ? ' Upload one above.' : ''}</p>
        )}
        {load.status === 'ready' && load.items.length > 0 && (
          <>
            <ul className="media-grid" aria-label="Pictures to choose from">
              {load.items.map((item) => (
                <li key={item.id} className="media-item">
                  <button
                    type="button"
                    className="media-choice"
                    aria-label={`Choose ${item.filename}`}
                    onClick={() => onChoose(item)}
                  >
                    <span className="media-thumb">
                      <img src={item.thumbUrl} alt="" loading="lazy" />
                    </span>
                    <span className="media-name">{item.filename}</span>
                  </button>
                </li>
              ))}
            </ul>
            {load.items.length < load.total && (
              <button type="button" className="secondary" onClick={() => void showMore()}>
                Show more pictures
              </button>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}
