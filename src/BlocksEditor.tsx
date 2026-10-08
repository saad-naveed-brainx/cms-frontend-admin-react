import { useEffect, useRef } from 'react'
import { isRecord } from './api.ts'
import { BLOCK_SCHEMAS, schemaFor } from './block-schemas.ts'
import type { BlockSchema, Field } from './block-schemas.ts'
import { blockName, fieldId, newKey } from './block-drafts.ts'
import type { Draft } from './block-drafts.ts'

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

type FieldProps = {
  field: Field
  value: unknown
  path: string
  errors: Record<string, string>
  /** Whether this field must be filled for the block to be saved (so it is marked with *). */
  mustFill: boolean
  onChange: (value: unknown) => void
}

function FieldView({ field, value, path, errors, mustFill, onChange }: FieldProps) {
  const id = fieldId(path)
  const error = errors[path]
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const star =
    mustFill && 'required' in field && field.required ? <span aria-hidden="true"> *</span> : null

  switch (field.kind) {
    case 'text':
    case 'textarea': {
      const text = typeof value === 'string' ? value : ''
      const shared = {
        id,
        value: text,
        'aria-invalid': error !== undefined,
        'aria-describedby': error ? errorId : field.hint ? hintId : undefined,
      }
      return (
        <div className="field">
          <label htmlFor={id}>
            {field.label}
            {star}
          </label>
          {field.kind === 'text' ? (
            <input {...shared} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <textarea {...shared} rows={3} onChange={(event) => onChange(event.target.value)} />
          )}
          {error && (
            <p id={errorId} className="field-error">
              {error}
            </p>
          )}
          {field.hint && (
            <p id={hintId} className="hint">
              {field.hint}
            </p>
          )}
        </div>
      )
    }

    case 'choice': {
      const chosen = field.options.some((option) => option.value === value)
        ? (value as string)
        : field.options[0].value
      return (
        <div className="field">
          <label htmlFor={id}>{field.label}</label>
          <select id={id} value={chosen} onChange={(event) => onChange(event.target.value)}>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

    case 'toggle':
      return (
        <div className="field">
          <label className="check" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              aria-describedby={field.hint ? hintId : undefined}
              onChange={(event) => onChange(event.target.checked)}
            />
            {field.label}
          </label>
          {field.hint && (
            <p id={hintId} className="hint">
              {field.hint}
            </p>
          )}
        </div>
      )

    case 'group': {
      const object = isRecord(value) ? value : {}
      return (
        <fieldset className="group">
          <legend>
            {field.label}
            {star}
          </legend>
          {field.fields.map((sub) => (
            <FieldView
              key={sub.key}
              field={sub}
              value={object[sub.key]}
              path={`${path}.${sub.key}`}
              errors={errors}
              mustFill={mustFill && field.required === true}
              onChange={(next) => onChange({ ...object, [sub.key]: next })}
            />
          ))}
        </fieldset>
      )
    }

    case 'list': {
      const entries: unknown[] = Array.isArray(value) ? value : []
      return (
        <fieldset className="group">
          <legend>{field.label}</legend>
          {entries.map((entry, index) => {
            const object = isRecord(entry) ? entry : {}
            const name = `${capitalise(field.itemName)} ${index + 1}`
            return (
              <div className="list-entry" role="group" aria-label={name} key={index}>
                <div className="entry-bar">
                  <span>{name}</span>
                  <button
                    type="button"
                    className="secondary small"
                    aria-label={`Remove ${field.itemName} ${index + 1}`}
                    onClick={() => onChange(entries.filter((_, at) => at !== index))}
                  >
                    Remove
                  </button>
                </div>
                {field.fields.map((sub) => (
                  <FieldView
                    key={sub.key}
                    field={sub}
                    value={object[sub.key]}
                    path={`${path}.${index}.${sub.key}`}
                    errors={errors}
                    mustFill={false}
                    onChange={(next) =>
                      onChange(
                        entries.map((one, at) =>
                          at === index ? { ...object, [sub.key]: next } : one,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            )
          })}
          {entries.length < field.max && (
            <div>
              <button
                type="button"
                className="secondary small"
                onClick={() => onChange([...entries, {}])}
              >
                Add {field.itemName}
              </button>
            </div>
          )}
        </fieldset>
      )
    }
  }
}

type Props = {
  drafts: Draft[]
  errors: Record<string, string>
  onChange: (drafts: Draft[]) => void
}

/**
 * The page's blocks, one card each, in the order they appear on the site: fill the fields, move a
 * block up or down, delete it, or add one of the offered types. A block of a type the editor does
 * not know (such as one holding HTML) is shown and kept as it is. Nothing is saved from here: the
 * page's Save button sends the lot.
 */
export default function BlocksEditor({ drafts, errors, onChange }: Props) {
  // Where the cursor goes after the next render (a moved block's button, a new block's first field).
  const focusNext = useRef<string | null>(null)
  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus()
    focusNext.current = null
  })

  function add(schema: BlockSchema) {
    const key = newKey()
    focusNext.current = fieldId(`${key}.${schema.fields[0].key}`)
    onChange([...drafts, { key, block: schema.blank() }])
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by
    const next = [...drafts]
    ;[next[index], next[target]] = [next[target], next[index]]
    // Keep the cursor on the moved block's own button, or on the other one when it can go no further.
    const atEnd = target === 0 || target === drafts.length - 1
    const direction = atEnd ? (by === -1 ? 'down' : 'up') : by === -1 ? 'up' : 'down'
    focusNext.current = `block-${drafts[index].key}-${direction}`
    onChange(next)
  }

  function remove(index: number) {
    focusNext.current = 'blocks-heading'
    onChange(drafts.filter((_, at) => at !== index))
  }

  return (
    <section className="blocks" aria-labelledby="blocks-heading">
      <h2 id="blocks-heading" tabIndex={-1}>
        Blocks
      </h2>
      <p className="hint">
        The blocks make up the page, from top to bottom. Fields marked * must be filled; anything
        else left empty is left out.
      </p>
      {drafts.length === 0 && <p>No blocks yet. Add one below.</p>}
      <ol className="block-list">
        {drafts.map((draft, index) => {
          const schema = schemaFor(draft.block.type)
          const title = `${index + 1}. ${blockName(draft.block)}`
          return (
            <li key={draft.key} className="block-card">
              <section aria-labelledby={`block-${draft.key}-title`}>
                <div className="block-bar">
                  <h3 id={`block-${draft.key}-title`}>{title}</h3>
                  <div className="block-actions">
                    <button
                      type="button"
                      id={`block-${draft.key}-up`}
                      className="secondary small"
                      aria-label={`Move block ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      id={`block-${draft.key}-down`}
                      className="secondary small"
                      aria-label={`Move block ${index + 1} down`}
                      disabled={index === drafts.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      aria-label={`Delete block ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {schema ? (
                  <div className="form">
                    {schema.fields.map((field) => (
                      <FieldView
                        key={field.key}
                        field={field}
                        value={draft.block[field.key]}
                        path={`${draft.key}.${field.key}`}
                        errors={errors}
                        mustFill
                        onChange={(next) =>
                          onChange(
                            drafts.map((one) =>
                              one.key === draft.key
                                ? { ...one, block: { ...one.block, [field.key]: next } }
                                : one,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="hint">
                    This block cannot be edited here. It is kept exactly as it is when you save.
                  </p>
                )}
              </section>
            </li>
          )
        })}
      </ol>
      <div className="block-add" role="group" aria-label="Add a block">
        {BLOCK_SCHEMAS.map((schema) => (
          <button key={schema.type} type="button" className="secondary" onClick={() => add(schema)}>
            Add {schema.name}
          </button>
        ))}
      </div>
    </section>
  )
}
