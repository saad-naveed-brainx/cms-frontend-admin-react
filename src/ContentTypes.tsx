import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError, isRecord } from './api.ts'
import { describeFailure, listPath, pluralLabel, typeAddress } from './helpers.ts'
import { announceTypesChanged, createType, fetchTypes } from './pages-api.ts'
import type { PageType } from './pages-api.ts'
import { useSignedIn } from './useSignedIn.ts'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; types: PageType[] }
type Field = 'name' | 'urlPrefix'

/**
 * The site's content types (D-043), and Add New Type: a name ("Recipe") and the address its items live
 * under ("/recipes", suggested from the name until it is typed over). A new type gets its menu entry
 * at once, and its items are made like pages. Only with `content_types.manage`; nothing about a type
 * can be changed once it is made.
 */
export default function ContentTypes() {
  const { canManageTypes } = useSignedIn()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [typedAddress, setTypedAddress] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<PageType | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTypes()
      .then((types) => {
        if (!cancelled) setLoad({ status: 'ready', types })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Until an address is typed, it follows the name: "Recipe" is /recipes.
  const address =
    typedAddress === null ? typeAddress(name.trim() ? pluralLabel(name.trim()) : '') : typedAddress

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setFormError(null)
    setMade(null)
    const problems: Partial<Record<Field, string>> = {}
    if (name.trim() === '') problems.name = 'Enter a name.'
    else if (name.trim().length > 60) problems.name = 'Use 60 characters or fewer.'
    if (address === '') problems.urlPrefix = 'Enter an address.'
    setErrors(problems)
    const first = Object.keys(problems)[0]
    if (first !== undefined) {
      document.getElementById(first)?.focus()
      return
    }

    setBusy(true)
    try {
      const type = await createType({ name: name.trim(), urlPrefix: `/${address}` })
      setLoad((now) =>
        now.status === 'ready' ? { status: 'ready', types: [...now.types, type] } : now,
      )
      setMade(type)
      setName('')
      setTypedAddress(null)
      announceTypesChanged()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const message = isRecord(error.body) ? error.body.message : undefined
        setFormError(typeof message === 'string' ? `${message}.` : 'That name or address is taken.')
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('Only an administrator of this site can make content types.')
      } else {
        const failure = describeFailure(error, ['name', 'urlPrefix'])
        setErrors(failure.fields)
        setFormError(failure.form)
      }
    } finally {
      setBusy(false)
    }
  }

  const field = (id: Field) => ({
    id,
    'aria-invalid': errors[id] !== undefined,
    'aria-describedby': errors[id] ? `${id}-hint ${id}-error` : `${id}-hint`,
  })

  return (
    <main>
      <h1>Content types</h1>
      <p className="hint">
        Each kind of content the site has. Its items are built from blocks, like pages, and live at
        its own address.
      </p>

      {made && (
        <p role="status" className="notice">
          {made.name} was made. Its items will be at {made.urlPrefix}/…, and {made.urlPrefix} lists
          them once one is published.{' '}
          <Link to={`/pages/new?type=${encodeURIComponent(made.slug)}`}>Add New {made.name}</Link>
        </p>
      )}

      {load.status === 'loading' && <p role="status">Loading content types…</p>}
      {load.status === 'failed' && (
        <div className="problem">
          <p role="alert">Couldn’t load the content types.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {load.status === 'ready' && (
        <table className="list-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Items live at</th>
              <th scope="col" className="hide-narrow">
                Made by
              </th>
            </tr>
          </thead>
          <tbody>
            {load.types.map((type) => (
              <tr key={type.id}>
                <td className="title-col">
                  <strong>{pluralLabel(type.name)}</strong>
                  <div className="row-actions">
                    <Link to={listPath(type.slug)}>All {pluralLabel(type.name)}</Link>
                  </div>
                </td>
                <td>
                  {type.urlPrefix ? (
                    <code>{type.urlPrefix}/…</code>
                  ) : (
                    <span className="hint">Their own address (/about)</span>
                  )}
                </td>
                <td className="hide-narrow">
                  {type.isBuiltin === false ? 'This site' : 'Built in'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManageTypes ? (
        <section className="postbox add-type" aria-labelledby="add-type-heading">
          <h2 id="add-type-heading" className="postbox-title">
            Add New Type
          </h2>
          <form className="postbox-inside form-stack" noValidate onSubmit={create}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                {...field('name')}
                value={name}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
              <p id="name-hint" className="hint">
                One of them, as you would say it: Recipe, Event, Team member.
              </p>
              {errors.name && (
                <p id="name-error" className="field-error">
                  {errors.name}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="urlPrefix">Address</label>
              <div className="address-input">
                <span aria-hidden="true">/</span>
                <input
                  {...field('urlPrefix')}
                  value={address}
                  autoComplete="off"
                  onChange={(event) => setTypedAddress(typeAddress(event.target.value))}
                />
              </div>
              <p id="urlPrefix-hint" className="hint">
                {address
                  ? `Its items will be at /${address}/…, and /${address} lists them.`
                  : 'Where its items live on the site, like /recipes.'}
              </p>
              {errors.urlPrefix && (
                <p id="urlPrefix-error" className="field-error">
                  {errors.urlPrefix}
                </p>
              )}
            </div>
            {formError && (
              <p role="alert" className="form-error">
                {formError}
              </p>
            )}
            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? 'Making…' : 'Make content type'}
              </button>
            </div>
            <p className="hint">A content type can’t be renamed or removed once it is made.</p>
          </form>
        </section>
      ) : (
        <p className="hint">Only an administrator of this site can make content types.</p>
      )}
    </main>
  )
}
