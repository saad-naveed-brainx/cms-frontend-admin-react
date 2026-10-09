import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { parseBlocks } from '@/blocks/parse-blocks'
import { PALETTES } from '@/site/palettes'
import { SiteChrome } from '@/site/SiteChrome'
import type { SiteView } from '@/site/types'
import { ApiError } from './api.ts'
import {
  accentWarning,
  appearanceChanges,
  brandWarning,
  draftFrom,
  pickerValue,
  themeFrom,
  validateDraft,
  withPalette,
} from './appearance-draft.ts'
import type { AppearanceDraft, DraftField } from './appearance-draft.ts'
import { fetchAppearance, saveAppearance } from './appearance-api.ts'
import type { Appearance as Saved } from './appearance-api.ts'
import { describeFailure } from './helpers.ts'
import { useLeaveGuard } from './leave-guard.ts'
import { fetchPage, fetchPages } from './pages-api.ts'
import PreviewFrame from './PreviewFrame.tsx'
import { reloadProfile } from './session.ts'
import { useSignedIn } from './useSignedIn.ts'

/** The site's own pages the preview draws: its home page's blocks, and a menu of its published pages. */
type SitePages = { home: unknown[] | null; nav: { label: string; href: string }[] }

type Loaded =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; saved: Saved; pages: SitePages }

const CHOICES = {
  typeSet: [
    ['editorial', 'Editorial', 'Fraunces headings, Karla text'],
    ['technical', 'Technical', 'Archivo Narrow headings, IBM Plex text'],
  ],
  shape: [
    ['soft', 'Soft', 'rounded corners'],
    ['sharp', 'Sharp', 'square corners'],
  ],
  density: [
    ['comfortable', 'Comfortable', 'roomy sections'],
    ['tight', 'Tight', 'compact sections'],
  ],
  texture: [
    ['none', 'None', 'a plain background'],
    ['grain', 'Grain', 'a paper-like grain'],
    ['grid', 'Grid', 'fine grid lines'],
  ],
} as const

const LEGENDS = { typeSet: 'Fonts', shape: 'Corners', density: 'Spacing', texture: 'Background' }

/**
 * The site's published pages, for the preview: the home page's blocks (or none), and a menu of the
 * other published pages by title, at most eight, close to what the website's own menu shows.
 */
async function loadSitePages(): Promise<SitePages> {
  const list = await fetchPages({ type: 'page', status: 'published', limit: 100, offset: 0 })
  const home = list.items.find((page) => page.path === '/home')
  const nav = list.items
    .filter((page) => page.path !== '/home')
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8)
    .map((page) => ({ label: page.title, href: page.path }))
  return { home: home ? (await fetchPage(home.id)).blocks : null, nav }
}

/** What the preview draws: the website's own header, home page and footer, in the theme being made. */
function previewOf(draft: AppearanceDraft, pages: SitePages, host: string): SiteView {
  return {
    settings: {
      name: draft.name.trim() || 'Your site',
      tagline: draft.tagline.trim(),
      host,
      nav: pages.nav,
      footer: {
        note: draft.footerNote.trim(),
        groups: pages.nav.length > 0 ? [{ title: 'Pages', links: pages.nav }] : [],
      },
      theme: themeFrom(draft),
    },
    page: { path: '/', title: 'Home', blocks: parseBlocks(pages.home ?? []) },
  }
}

/**
 * Appearance (GOV-04, WordPress's Appearance → Customize): the site's name, the tagline beside it in
 * the header, the note in its footer, and its look: a ready-made palette with the site's own brand
 * and accent colours, fonts, corners, spacing and background. The preview beside it draws the
 * website's own header, home page and footer as they change. Saving needs `settings.manage`.
 */
export default function Appearance() {
  const { canManageSettings, siteId, siteHost } = useSignedIn()
  const [load, setLoad] = useState<Loaded>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState<AppearanceDraft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAppearance(), loadSitePages()])
      .then(([saved, pages]) => {
        if (cancelled) return
        setLoad({ status: 'ready', saved, pages })
        setDraft(draftFrom(saved))
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const changes = load.status === 'ready' && draft ? appearanceChanges(draft, load.saved) : {}
  const changed = Object.keys(changes).length > 0
  useLeaveGuard(changed)

  if (load.status === 'loading' || (load.status === 'ready' && !draft)) {
    return (
      <main>
        <p role="status">Loading appearance…</p>
      </main>
    )
  }
  if (load.status === 'error' || !draft) {
    return (
      <main>
        <h1>Appearance</h1>
        <div className="problem">
          <p role="alert">Couldn't load this site's appearance.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  const { pages } = load
  const editable = canManageSettings
  const set = (next: AppearanceDraft) => {
    setDraft(next)
    setNotice(null)
  }
  const accentProblem = accentWarning(draft)
  const brandProblem = brandWarning(draft)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !editable || !draft) return
    setNotice(null)
    setFormError(null)
    const problems = validateDraft(draft)
    setErrors(problems)
    const first = Object.keys(problems)[0]
    if (first !== undefined) {
      document.getElementById(first)?.focus()
      return
    }

    inFlight.current = true
    setSaving(true)
    try {
      const next = await saveAppearance(changes)
      setLoad({ status: 'ready', saved: next, pages })
      setDraft(draftFrom(next))
      setNotice('Saved. The site shows it now.')
      // The top bar's name and the edit screen's preview come from sign-in: ask again.
      await reloadProfile(siteId ?? undefined).catch(() => undefined)
    } catch (error) {
      const failure = describeFailure(error, ['name', 'tagline', 'footerNote'])
      setErrors(failure.fields)
      setFormError(
        error instanceof ApiError && error.status === 403
          ? 'Only an administrator of this site can change how it looks.'
          : failure.form,
      )
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const textField = (field: DraftField, label: string, hint: string) => (
    <div className="field">
      <label htmlFor={field}>{label}</label>
      <input
        id={field}
        value={draft[field]}
        readOnly={!editable}
        onChange={(event) => set({ ...draft, [field]: event.target.value })}
        aria-invalid={errors[field] !== undefined}
        aria-describedby={errors[field] ? `${field}-hint ${field}-error` : `${field}-hint`}
      />
      <p id={`${field}-hint`} className="hint">
        {hint}
      </p>
      {errors[field] && (
        <p id={`${field}-error`} className="field-error">
          {errors[field]}
        </p>
      )}
    </div>
  )

  return (
    <main>
      <h1>Appearance</h1>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!editable && (
        <p role="status" className="notice">
          You can see how this site looks but not change it.
        </p>
      )}
      <form className="edit-layout" noValidate onSubmit={save}>
        <div className="edit-main">
          <section className="postbox" aria-labelledby="identity-heading">
            <h2 id="identity-heading" className="postbox-title">
              Header and footer
            </h2>
            <div className="postbox-inside form-stack">
              {textField(
                'name',
                'Site name',
                'Shown in the header and footer, and at the end of page titles.',
              )}
              {textField(
                'tagline',
                'Tagline',
                'A short line beside the name in the header. Leave empty for none.',
              )}
              {textField(
                'footerNote',
                'Footer note',
                'A line in the footer: an address, opening hours, a copyright notice. Leave empty for none.',
              )}
              <p className="hint">
                A logo image comes with the media library; until then the name is the logo.
              </p>
            </div>
          </section>

          <section className="postbox" aria-labelledby="colours-heading">
            <h2 id="colours-heading" className="postbox-title">
              Colours
            </h2>
            <div className="postbox-inside form-stack">
              <fieldset className="palettes">
                <legend>Palette</legend>
                <p className="hint">
                  Each is made to read well. Pick one, then set your own brand and accent colours.
                </p>
                {PALETTES.map((choice) => (
                  <label key={choice.name} className="palette-choice">
                    <input
                      type="radio"
                      name="palette"
                      value={choice.name}
                      checked={draft.paletteName === choice.name}
                      disabled={!editable}
                      onChange={() => set(withPalette(draft, choice.name))}
                    />
                    <span className="palette-name">{choice.label}</span>
                    <span className="swatches" aria-hidden="true">
                      {(['paper', 'ink', 'brand', 'accent'] as const).map((key) => (
                        <span
                          key={key}
                          className="swatch"
                          style={{ background: choice.palette[key] }}
                        />
                      ))}
                    </span>
                  </label>
                ))}
                {draft.paletteName === null && (
                  <p className="hint">
                    This site’s colours are its own; picking a palette replaces them.
                  </p>
                )}
              </fieldset>

              <div className="colour-row">
                <div className="field">
                  <label htmlFor="brand">Brand colour</label>
                  <input
                    id="brand"
                    type="color"
                    value={pickerValue(draft.brand)}
                    disabled={!editable}
                    onChange={(event) => set({ ...draft, brand: event.target.value })}
                    aria-describedby="brand-hint"
                  />
                  <p id="brand-hint" className={brandProblem ? 'field-error' : 'hint'}>
                    {brandProblem ?? 'Buttons. Their text is set to read well on it.'}
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="accent">Accent colour</label>
                  <input
                    id="accent"
                    type="color"
                    value={pickerValue(draft.accent)}
                    disabled={!editable}
                    onChange={(event) => set({ ...draft, accent: event.target.value })}
                    aria-describedby="accent-hint"
                  />
                  <p id="accent-hint" className={accentProblem ? 'field-error' : 'hint'}>
                    {accentProblem ?? 'Small labels, link underlines and highlights.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="postbox" aria-labelledby="style-heading">
            <h2 id="style-heading" className="postbox-title">
              Fonts and layout
            </h2>
            <div className="postbox-inside form-stack">
              {(Object.keys(CHOICES) as (keyof typeof CHOICES)[]).map((part) => (
                <fieldset key={part} className="choices">
                  <legend>{LEGENDS[part]}</legend>
                  {CHOICES[part].map(([value, label, detail]) => (
                    <label key={value} className="check">
                      <input
                        type="radio"
                        name={part}
                        value={value}
                        checked={draft[part] === value}
                        disabled={!editable}
                        onChange={() => set({ ...draft, [part]: value })}
                      />
                      {label} <span className="hint">— {detail}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </section>
        </div>

        <aside className="edit-side">
          <PreviewFrame
            heading="Your site"
            frameTitle="Live preview of the site"
            notes={
              pages.home === null ? (
                <p className="hint live-preview-note">
                  No published home page yet: the preview shows the header and footer.
                </p>
              ) : undefined
            }
          >
            <SiteChrome site={previewOf(draft, pages, siteHost ?? '')} />
          </PreviewFrame>
        </aside>

        {editable && (
          <div className="save-bar">
            <p className="save-bar-state">
              {changed ? 'You have unsaved changes.' : 'No unsaved changes.'}
            </p>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
            <button type="submit" disabled={saving || !changed} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </form>
    </main>
  )
}
