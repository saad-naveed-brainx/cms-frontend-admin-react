import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import previewCss from './preview/preview.css?inline'

/** How wide each view draws the page: a desktop browser, and a phone. */
const WIDTHS = { desktop: 1280, mobile: 390 } as const
type View = keyof typeof WIDTHS

/**
 * The frame's own document: same origin as the admin, with only the preview's stylesheet. Its page
 * is the frame's full height, so a site's frame (`min-h-full`) reaches the bottom.
 */
const FRAME_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"><style>${previewCss}</style><style>html,body{height:100%}</style></head><body></body></html>`

type Props = {
  /** The box's heading ("What visitors will see"). */
  heading: string
  /** The frame's accessible name. */
  frameTitle: string
  /** Lines shown above the frame (what is left out, what is missing). */
  notes?: ReactNode
  /** What is drawn inside the frame: the website's own components (src/site-blocks, D-030). */
  children: ReactNode
}

/**
 * A preview box drawing the website's own components in a same-origin frame, so the website's
 * styles cannot touch the admin and its layout measures the frame's width, not the window's. The
 * desktop view is drawn at 1280 pixels and shrunk to fit; links inside do nothing. Used by the edit
 * screen (`LivePreview`, a page's blocks) and the Appearance screen (the whole site frame).
 */
export default function PreviewFrame({ heading, frameTitle, notes, children }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [view, setView] = useState<View>('desktop')
  const [boxWidth, setBoxWidth] = useState(0)
  const headingId = useId()

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function frameLoaded() {
    const doc = frame.current?.contentDocument
    if (!doc) return
    // A link in the preview must not take the frame to the website (or the admin) on a click.
    doc.addEventListener('click', (event) => {
      if ((event.target as Element | null)?.closest?.('a')) event.preventDefault()
    })
    setBody(doc.body)
  }

  const width = WIDTHS[view]
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1

  return (
    <section className="postbox live-preview" aria-labelledby={headingId}>
      <div className="postbox-title live-preview-bar">
        <h2 id={headingId}>{heading}</h2>
        <div className="live-preview-views" role="group" aria-label="Preview size">
          {(Object.keys(WIDTHS) as View[]).map((name) => (
            <button
              key={name}
              type="button"
              className="secondary small"
              aria-pressed={view === name}
              onClick={() => setView(name)}
            >
              {name === 'desktop' ? 'Desktop' : 'Mobile'}
            </button>
          ))}
        </div>
      </div>
      {notes}
      <div ref={box} className="live-preview-box">
        <iframe
          ref={frame}
          title={frameTitle}
          srcDoc={FRAME_DOCUMENT}
          onLoad={frameLoaded}
          className="live-preview-frame"
          style={{ width, transform: `scale(${scale})`, height: `${100 / scale}%` }}
        />
      </div>
      {body && createPortal(children, body)}
    </section>
  )
}
