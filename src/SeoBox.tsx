import { useState } from 'react'
import {
  SHOWN_DESCRIPTION,
  SHOWN_TITLE,
  isFullAddress,
  resultAddress,
  shorten,
} from './seo-fields.ts'
import type { SeoDraft, SeoField } from './seo-fields.ts'

type Props = {
  draft: SeoDraft
  errors: Partial<Record<SeoField, string>>
  editable: boolean
  /** The title the website uses when the SEO title is empty: "About — Orchard Bakery". */
  defaultTitle: string
  /** The page's own address on its site, for the result preview and the canonical box's hint. */
  ownAddress: string
  siteName: string | null
  onChange: (next: SeoDraft) => void
}

/** "12 characters. Google shows about 60." with a warning once the end may be cut off. */
function lengthHint(text: string, shown: number): string {
  const count = text.trim().length
  const counted = `${count} ${count === 1 ? 'character' : 'characters'}.`
  return count > shown
    ? `${counted} Google shows about ${shown}, so the end may be cut off.`
    : `${counted} Google shows about ${shown}.`
}

/**
 * The page's search-engine fields (SEO-01), as WordPress's Yoast box offers them: the title and
 * description a search result shows, with a preview of that result as they are typed; "hide from
 * search engines"; and, under Advanced, the address search engines should treat as the original.
 * Nothing here is saved until Save; the website writes these into the page's `<head>`.
 */
export default function SeoBox({
  draft,
  errors,
  editable,
  defaultTitle,
  ownAddress,
  siteName,
  onChange,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(draft.canonicalUrl !== '')
  const set = <K extends SeoField>(field: K, value: SeoDraft[K]) =>
    onChange({ ...draft, [field]: value })

  const title = draft.seoTitle.trim() || defaultTitle
  const description = draft.seoDescription.trim()
  const canonical = draft.canonicalUrl.trim()
  const shownAddress = isFullAddress(canonical) ? canonical : ownAddress
  const describedBy = (field: SeoField, hint: string) =>
    errors[field] ? `${hint} ${field}-error` : hint

  return (
    <section className="postbox seo-box" aria-labelledby="seo-heading">
      <h2 id="seo-heading" className="postbox-title">
        Search engines
      </h2>
      <div className="postbox-inside seo-inside">
        <div className="serp" role="group" aria-label="Search result preview">
          <p className="serp-label">How it may look in search results</p>
          {siteName && <p className="serp-site">{siteName}</p>}
          <p className="serp-address">{resultAddress(shownAddress)}</p>
          <p className="serp-title">{shorten(title, SHOWN_TITLE)}</p>
          <p className="serp-description">
            {description ? (
              shorten(description, SHOWN_DESCRIPTION)
            ) : (
              <span className="serp-empty">
                No description: the search engine picks some text from the page.
              </span>
            )}
          </p>
          {draft.noIndex && (
            <p className="serp-hidden">Hidden: this page asks search engines not to list it.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="seoTitle">SEO title</label>
          <input
            id="seoTitle"
            value={draft.seoTitle}
            placeholder={defaultTitle}
            readOnly={!editable}
            onChange={(event) => set('seoTitle', event.target.value)}
            aria-invalid={errors.seoTitle !== undefined}
            aria-describedby={describedBy('seoTitle', 'seoTitle-hint')}
          />
          <p id="seoTitle-hint" className="hint">
            {lengthHint(draft.seoTitle, SHOWN_TITLE)} Leave empty to use the page title.
          </p>
          {errors.seoTitle && (
            <p id="seoTitle-error" className="field-error">
              {errors.seoTitle}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="seoDescription">Meta description</label>
          <textarea
            id="seoDescription"
            rows={3}
            value={draft.seoDescription}
            readOnly={!editable}
            onChange={(event) => set('seoDescription', event.target.value)}
            aria-invalid={errors.seoDescription !== undefined}
            aria-describedby={describedBy('seoDescription', 'seoDescription-hint')}
          />
          <p id="seoDescription-hint" className="hint">
            {lengthHint(draft.seoDescription, SHOWN_DESCRIPTION)}
          </p>
          {errors.seoDescription && (
            <p id="seoDescription-error" className="field-error">
              {errors.seoDescription}
            </p>
          )}
        </div>

        <div className="field">
          <label className="check">
            <input
              id="noIndex"
              type="checkbox"
              checked={draft.noIndex}
              disabled={!editable}
              onChange={(event) => set('noIndex', event.target.checked)}
              aria-describedby="noIndex-hint"
            />
            Hide this page from search engines
          </label>
          <p id="noIndex-hint" className="hint">
            Search engines are asked not to list it. Anyone with the link can still open it.
          </p>
        </div>

        <details
          className="seo-advanced"
          open={advancedOpen || canonical !== ''}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary>Advanced</summary>
          <div className="field">
            <label htmlFor="canonicalUrl">Canonical address</label>
            <input
              id="canonicalUrl"
              type="url"
              inputMode="url"
              value={draft.canonicalUrl}
              placeholder={ownAddress}
              readOnly={!editable}
              onChange={(event) => set('canonicalUrl', event.target.value)}
              aria-invalid={errors.canonicalUrl !== undefined}
              aria-describedby={describedBy('canonicalUrl', 'canonicalUrl-hint')}
            />
            <p id="canonicalUrl-hint" className="hint">
              Only for a page copied from another address: search engines then credit that one.
              Empty uses this page's own address.
            </p>
            {errors.canonicalUrl && (
              <p id="canonicalUrl-error" className="field-error">
                {errors.canonicalUrl}
              </p>
            )}
          </div>
        </details>
      </div>
    </section>
  )
}
