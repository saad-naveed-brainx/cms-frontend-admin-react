import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockRenderer } from '@/blocks/BlockRenderer'
import { parseBlocks } from '@/blocks/parse-blocks'
import { resolveTheme } from '@/site/resolve-theme'
import { SiteThemeRoot } from '@/theme/SiteThemeRoot'
import previewCss from './preview/preview.css?inline'

/** How wide each view draws the page: a desktop browser, and a phone. */
const WIDTHS = { desktop: 1280, mobile: 390 } as const
type View = keyof typeof WIDTHS

/** The frame's own document: same origin as the admin, with only the preview's stylesheet. */
const FRAME_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"><style>${previewCss}</style></head><body></body></html>`

type Props = {
  /** The blocks as they would be saved (empty fields already left out). */
  blocks: unknown[]
  /** The site's stored theme, laid over the default as the website does. */
  theme: unknown
}

/**
 * "What visitors will see": the page's blocks drawn by the website's own components (copied from
 * web, src/site-blocks, D-030) in the site's theme, updated as the forms change. It is a same-origin
 * frame, so the website's styles cannot touch the admin and the blocks lay themselves out for the
 * frame's width, not the window's. The desktop view is drawn at 1280 pixels and shrunk to fit.
 * A block the website would leave out (a required field still empty) is left out here too.
 */
export default function LivePreview({ blocks, theme }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const [view, setView] = useState<View>('desktop')
  const [boxWidth, setBoxWidth] = useState(0)

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

  const drawn = parseBlocks(blocks)
  const hidden = blocks.length - drawn.length
  const width = WIDTHS[view]
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1

  return (
    <section className="postbox live-preview" aria-labelledby="live-preview-heading">
      <div className="postbox-title live-preview-bar">
        <h2 id="live-preview-heading">What visitors will see</h2>
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
      {blocks.length === 0 && (
        <p className="hint live-preview-note">No blocks yet: add one and it shows here as you fill it in.</p>
      )}
      {hidden > 0 && (
        <p className="hint live-preview-note">
          {hidden === 1 ? '1 block is' : `${hidden} blocks are`} not shown: the site leaves out a
          block whose required fields are empty, and rich text for now.
        </p>
      )}
      <div ref={box} className="live-preview-box">
        <iframe
          ref={frame}
          title="Live preview of this page"
          srcDoc={FRAME_DOCUMENT}
          onLoad={frameLoaded}
          className="live-preview-frame"
          style={{ width, transform: `scale(${scale})`, height: `${100 / scale}%` }}
        />
      </div>
      {body &&
        createPortal(
          <SiteThemeRoot theme={resolveTheme(theme)} className="min-h-screen">
            <BlockRenderer blocks={drawn} />
          </SiteThemeRoot>,
          body,
        )}
    </section>
  )
}
