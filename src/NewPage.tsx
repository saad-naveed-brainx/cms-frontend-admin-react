import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { SLUG_SHAPE, addressFor, describeFailure, listPath, slugify } from './helpers.ts'
import { createPage, fetchTypes } from './pages-api.ts'
import type { PageType } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

/** The content types, or null when they could not be loaded; which load attempt it answers is kept with it. */
type TypesAnswer = { attempt: number; types: PageType[] | null }

/** Type, title and slug. The slug follows the title until it is edited by hand; the address shown is a courtesy, the server builds the real one. */
export default function NewPage() {
  const { canCreate } = useSignedIn()
  const navigate = useNavigate()
  // The menu's "Add New" under a content type opens this form with that type chosen.
  const [params] = useSearchParams()
  const askedSlug = params.get('type')

  const [typesAnswer, setTypesAnswer] = useState<TypesAnswer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [chosenSlug, setChosenSlug] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const slugInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!canCreate) return
    let cancelled = false
    fetchTypes()
      .then((types) => {
        if (!cancelled) setTypesAnswer({ attempt, types })
      })
      .catch(() => {
        if (!cancelled) setTypesAnswer({ attempt, types: null })
      })
    return () => {
      cancelled = true
    }
  }, [canCreate, attempt])

  const types = typesAnswer?.attempt === attempt ? typesAnswer.types : undefined

  if (!canCreate) {
    return (
      <main>
        <Link className="back" to={listPath(askedSlug)}>
          ← Back
        </Link>
        <h1>New page</h1>
        <p role="status">You don't have permission to create pages on this site.</p>
      </main>
    )
  }

  if (types === null) {
    return (
      <main>
        <h1>New page</h1>
        <div className="problem">
          <p role="alert">Couldn't load the content types.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (types === undefined) {
    return (
      <main>
        <h1>New page</h1>
        <p role="status">Loading…</p>
      </main>
    )
  }

  const typeSlug =
    chosenSlug ||
    types.find((item) => item.slug === askedSlug)?.slug ||
    types[0]?.slug ||
    ''
  const chosenType = types.find((item) => item.slug === typeSlug)
  const address = addressFor(chosenType?.urlPrefix ?? null, slug)

  function changeTitle(value: string) {
    setTitle(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const tidyTitle = title.trim()
    const found: Record<string, string> = {}
    if (tidyTitle === '') found.title = 'Enter a title.'
    else if (tidyTitle.length > 200) found.title = 'Use 200 characters or fewer.'
    if (slug === '') found.slug = 'Enter a slug.'
    else if (slug.length > 80 || !SLUG_SHAPE.test(slug)) {
      found.slug = 'Use lower-case letters, digits and single hyphens, up to 80 characters.'
    }
    setErrors(found)
    setFormError(null)
    if (found.title) {
      titleInput.current?.focus()
      return
    }
    if (found.slug) {
      slugInput.current?.focus()
      return
    }

    inFlight.current = true
    setBusy(true)
    try {
      const page = await createPage({ type: typeSlug, title: tidyTitle, slug })
      navigate(`/pages/${page.id}`, { state: { created: true } })
    } catch (error) {
      const problems = describeFailure(error, ['type', 'title', 'slug'])
      setErrors(problems.fields)
      setFormError(problems.form)
      if (problems.fields.slug) slugInput.current?.focus()
      else if (problems.fields.title) titleInput.current?.focus()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <main>
      <Link className="back" to={listPath(askedSlug)}>
        ← Back
      </Link>
      <h1>New page</h1>
      <form className="form" noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={typeSlug}
            onChange={(event) => setChosenSlug(event.target.value)}
          >
            {types.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          {errors.type && (
            <p id="type-error" className="field-error">
              {errors.type}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            ref={titleInput}
            value={title}
            onChange={(event) => changeTitle(event.target.value)}
            aria-invalid={errors.title !== undefined}
            aria-describedby={errors.title ? 'title-error' : undefined}
          />
          {errors.title && (
            <p id="title-error" className="field-error">
              {errors.title}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            ref={slugInput}
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value)
              setSlugEdited(true)
            }}
            aria-invalid={errors.slug !== undefined}
            aria-describedby={errors.slug ? 'slug-error' : 'slug-hint'}
          />
          {errors.slug && (
            <p id="slug-error" className="field-error">
              {errors.slug}
            </p>
          )}
          <p id="slug-hint" className="hint">
            Address: <code>{address}</code>
          </p>
        </div>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Creating…' : 'Create page'}
          </button>
          <Link className="button secondary" to={listPath(askedSlug)}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
