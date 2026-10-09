import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { describeSiteFailure, tidyAddress } from './helpers.ts'
import { reloadProfile } from './session.ts'
import { createSite, fetchOrganizations } from './sites-api.ts'
import type { Organization } from './sites-api.ts'

const MAX_ADDRESSES = 10

/** The organisations the person owns, or null when they could not be loaded; which load attempt it answers is kept with it. */
type OrganizationsAnswer = { attempt: number; items: Organization[] | null }

/**
 * Name and web addresses (and which organisation, only when the person owns several). Creating the
 * site makes them its administrator, and the admin then switches to it.
 */
export default function NewSite() {
  const navigate = useNavigate()

  const [answer, setAnswer] = useState<OrganizationsAnswer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [addresses, setAddresses] = useState([''])
  const [organizationId, setOrganizationId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The name of a site that exists now but whose arrival the admin could not confirm. */
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const inFlight = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const addressInputs = useRef<(HTMLInputElement | null)[]>([])
  const organizationSelect = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchOrganizations()
      .then((items) => {
        if (!cancelled) setAnswer({ attempt, items })
      })
      .catch(() => {
        if (!cancelled) setAnswer({ attempt, items: null })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const organizations = answer?.attempt === attempt ? answer.items : undefined

  if (unconfirmed !== null) {
    return (
      <main>
        <h1>New site</h1>
        <div className="problem">
          <p role="status">
            “{unconfirmed}” was created, but your list of sites could not be refreshed.
          </p>
          <button type="button" onClick={() => window.location.assign('/pages')}>
            Reload
          </button>
        </div>
      </main>
    )
  }

  if (organizations === null) {
    return (
      <main>
        <h1>New site</h1>
        <div className="problem">
          <p role="alert">Couldn't load your organisations.</p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </div>
      </main>
    )
  }

  if (organizations === undefined) {
    return (
      <main>
        <h1>New site</h1>
        <p role="status">Loading…</p>
      </main>
    )
  }

  if (organizations.length === 0) {
    return (
      <main>
        <h1>New site</h1>
        <p role="status">Only the owner of an organisation can create sites.</p>
      </main>
    )
  }

  const mustChoose = organizations.length > 1

  function changeAddress(index: number, value: string) {
    setAddresses((rows) => rows.map((row, at) => (at === index ? value : row)))
  }

  function removeAddress(index: number) {
    setAddresses((rows) => rows.filter((_, at) => at !== index))
    // The messages are keyed by position, so they would point at the wrong row now.
    setErrors({})
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    const tidyName = name.trim()
    const tidy = addresses.map(tidyAddress)
    const found: Record<string, string> = {}
    if (tidyName === '') found.name = 'Enter a name.'
    else if (tidyName.length > 120) found.name = 'Use 120 characters or fewer.'
    tidy.forEach((address, index) => {
      if (address === '') {
        found[`hostnames.${index}`] =
          index === 0 ? 'Enter a web address.' : 'Enter a web address or remove this one.'
      }
    })
    if (mustChoose && organizationId === '') found.organizationId = 'Choose an organisation.'
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) {
      focusFirst(found)
      return
    }

    inFlight.current = true
    setBusy(true)
    try {
      const created = await createSite({
        name: tidyName,
        hostnames: tidy,
        ...(mustChoose ? { organizationId } : {}),
      })
      try {
        await reloadProfile(created.site.id)
      } catch {
        setUnconfirmed(created.site.name)
        return
      }
      navigate('/pages', { state: { siteCreated: true } })
    } catch (error) {
      const problems = describeSiteFailure(error, tidy)
      setErrors(problems.fields)
      setFormError(problems.form)
      focusFirst(problems.fields)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  /** Puts the cursor on the first field that has a message: name, then the addresses in order, then the organisation. */
  function focusFirst(fields: Record<string, string>) {
    const row = addresses.findIndex((_, index) => fields[`hostnames.${index}`] !== undefined)
    if (fields.name) nameInput.current?.focus()
    else if (row >= 0) addressInputs.current[row]?.focus()
    else if (fields.organizationId) organizationSelect.current?.focus()
  }

  return (
    <main>
      <Link className="back" to="/">
        ← Overview
      </Link>
      <h1>New site</h1>
      <form className="form" noValidate onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            ref={nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
          {errors.name && (
            <p id="name-error" className="field-error">
              {errors.name}
            </p>
          )}
        </div>
        {addresses.map((address, index) => {
          const error = errors[`hostnames.${index}`]
          return (
            <div className="field" key={index}>
              <label htmlFor={`address-${index}`}>
                {index === 0 ? 'Web address' : `Web address ${index + 1}`}
              </label>
              <div className="address-row">
                <input
                  id={`address-${index}`}
                  ref={(element) => {
                    addressInputs.current[index] = element
                  }}
                  value={address}
                  onChange={(event) => changeAddress(index, event.target.value)}
                  aria-invalid={error !== undefined}
                  aria-describedby={error ? `address-${index}-error` : 'address-hint'}
                />
                {index > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove web address ${index + 1}`}
                    onClick={() => removeAddress(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
              {error && (
                <p id={`address-${index}-error`} className="field-error">
                  {error}
                </p>
              )}
              {index === 0 && (
                <p id="address-hint" className="hint">
                  What people type to visit the site, like <code>cafe.example.com</code>. The first
                  address is the main one.
                </p>
              )}
            </div>
          )
        })}
        {addresses.length < MAX_ADDRESSES && (
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => setAddresses((rows) => [...rows, ''])}
            >
              Add another address
            </button>
          </div>
        )}
        {mustChoose && (
          <div className="field">
            <label htmlFor="organization">Organisation</label>
            <select
              id="organization"
              ref={organizationSelect}
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              aria-invalid={errors.organizationId !== undefined}
              aria-describedby={errors.organizationId ? 'organization-error' : undefined}
            >
              <option value="">Choose an organisation</option>
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.organizationId && (
              <p id="organization-error" className="field-error">
                {errors.organizationId}
              </p>
            )}
          </div>
        )}
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Creating…' : 'Create site'}
          </button>
          <Link className="button secondary" to="/">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
