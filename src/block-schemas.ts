import { isRecord } from './api.ts'

/**
 * What each block can hold, as the editor needs it: its fields, how an empty one is left out when
 * saving, and what must be filled before it can be saved. This is a stop-gap copy of the block
 * types the website draws (web/src/blocks/types.ts): they are meant to come from the shared
 * `cms-blocks` package (docs/DECISIONS.md D-008, ticket XRP-01), and until that exists the two
 * must be changed together. `richText` is not offered: its HTML is not safe to store until it is
 * cleaned on save (BLK-05).
 */

export type Block = Record<string, unknown>

type TextField = {
  kind: 'text' | 'textarea'
  key: string
  label: string
  max: number
  required?: boolean
  hint?: string
  /** Where the value may point: a link or an image (the same rule the website applies). */
  check?: 'link' | 'image'
}
type ChoiceField = {
  kind: 'choice'
  key: string
  label: string
  options: { value: string; label: string }[]
}
type ToggleField = { kind: 'toggle'; key: string; label: string; hint?: string }
/** An object made of sub-fields. When it is optional, it is only checked once something in it is filled. */
type GroupField = { kind: 'group'; key: string; label: string; required?: boolean; fields: Field[] }
/** A list of objects made of sub-fields. Entries left completely empty are dropped when saving. */
type ListField = {
  kind: 'list'
  key: string
  label: string
  itemName: string
  max: number
  required?: boolean
  fields: Field[]
}
export type Field = TextField | ChoiceField | ToggleField | GroupField | ListField

export type BlockSchema = {
  type: string
  name: string
  fields: Field[]
  /** A new block of this type, with what it cannot be without already in place. */
  blank: () => Block
}

const link = (key: string, label: string, required = false): GroupField => ({
  kind: 'group',
  key,
  label,
  required,
  fields: [
    { kind: 'text', key: 'label', label: 'Label', max: 80, required: true },
    {
      kind: 'text',
      key: 'href',
      label: 'Address',
      max: 500,
      required: true,
      check: 'link',
      hint: 'A full web address (https://…), a page on this site (/contact), mailto: or tel:.',
    },
  ],
})

const picture = (required: boolean): GroupField => ({
  kind: 'group',
  key: 'image',
  label: 'Image',
  required,
  fields: [
    {
      kind: 'text',
      key: 'src',
      label: 'Image address',
      max: 500,
      required: true,
      check: 'image',
      hint: 'A full web address (https://…) or a file on this site (/media/…).',
    },
    {
      kind: 'text',
      key: 'alt',
      label: 'Alt text',
      max: 200,
      required: true,
      hint: 'Describes the image for people who cannot see it.',
    },
    { kind: 'text', key: 'caption', label: 'Caption', max: 200 },
  ],
})

export const BLOCK_SCHEMAS: BlockSchema[] = [
  {
    type: 'hero',
    name: 'Hero',
    fields: [
      {
        kind: 'text',
        key: 'eyebrow',
        label: 'Eyebrow',
        max: 80,
        hint: 'A short line above the headline.',
      },
      { kind: 'text', key: 'headline', label: 'Headline', max: 200, required: true },
      { kind: 'textarea', key: 'body', label: 'Text', max: 1000 },
      link('primaryAction', 'Main button'),
      link('secondaryAction', 'Second link'),
      picture(false),
      {
        kind: 'list',
        key: 'facts',
        label: 'Facts',
        itemName: 'fact',
        max: 3,
        fields: [
          { kind: 'text', key: 'label', label: 'Label', max: 60, required: true },
          { kind: 'text', key: 'value', label: 'Value', max: 60, required: true },
        ],
      },
    ],
    blank: () => ({ type: 'hero' }),
  },
  {
    type: 'imageText',
    name: 'Image and text',
    fields: [
      { kind: 'text', key: 'heading', label: 'Heading', max: 200, required: true },
      { kind: 'textarea', key: 'body', label: 'Text', max: 1500, required: true },
      picture(true),
      {
        kind: 'choice',
        key: 'imagePosition',
        label: 'Image position',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      link('action', 'Link'),
    ],
    blank: () => ({ type: 'imageText', imagePosition: 'left' }),
  },
  {
    type: 'featureGrid',
    name: 'Feature grid',
    fields: [
      { kind: 'text', key: 'heading', label: 'Heading', max: 200 },
      { kind: 'textarea', key: 'intro', label: 'Introduction', max: 600 },
      {
        kind: 'toggle',
        key: 'ordered',
        label: 'Number the items',
        hint: 'Only when the items are steps in a sequence.',
      },
      {
        kind: 'list',
        key: 'items',
        label: 'Items',
        itemName: 'item',
        max: 12,
        required: true,
        fields: [
          { kind: 'text', key: 'label', label: 'Tag', max: 20, hint: 'A short tag, like LEI.' },
          { kind: 'text', key: 'title', label: 'Title', max: 120, required: true },
          { kind: 'textarea', key: 'body', label: 'Text', max: 500, required: true },
        ],
      },
    ],
    blank: () => ({ type: 'featureGrid', items: [{}] }),
  },
  {
    type: 'testimonial',
    name: 'Testimonial',
    fields: [
      { kind: 'textarea', key: 'quote', label: 'Quote', max: 500, required: true },
      { kind: 'text', key: 'attribution', label: 'Name', max: 120, required: true },
      { kind: 'text', key: 'role', label: 'Role', max: 120 },
    ],
    blank: () => ({ type: 'testimonial' }),
  },
  {
    type: 'cta',
    name: 'Call to action',
    fields: [
      { kind: 'text', key: 'heading', label: 'Heading', max: 200, required: true },
      { kind: 'textarea', key: 'body', label: 'Text', max: 600 },
      link('action', 'Button', true),
      { kind: 'text', key: 'note', label: 'Small print', max: 200 },
    ],
    blank: () => ({ type: 'cta' }),
  },
]

export const schemaFor = (type: unknown): BlockSchema | undefined =>
  BLOCK_SCHEMAS.find((schema) => schema.type === type)

/** Where a link may point: this site, another web address, an email or a phone number. Not `javascript:`. */
const SAFE_LINK = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i
/** Where an image may load from: a web address or a file on this site. */
const SAFE_IMAGE = /^(?:https?:\/\/|\/(?!\/))/i

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * What to store for one field, or `undefined` to leave it out: text is trimmed and an empty one is
 * left out, a group or list that ends up empty is left out (a required list stays, as `[]`).
 */
function cleanField(value: unknown, field: Field): unknown {
  switch (field.kind) {
    case 'text':
    case 'textarea':
      return textOf(value) === '' ? undefined : textOf(value)
    case 'choice':
      return field.options.some((option) => option.value === value) ? value : undefined
    case 'toggle':
      return value === true ? true : undefined
    case 'group': {
      const object = cleanObject(isRecord(value) ? value : {}, field.fields)
      return Object.keys(object).length === 0 ? undefined : object
    }
    case 'list': {
      const entries = (Array.isArray(value) ? value : [])
        .map((entry) => cleanObject(isRecord(entry) ? entry : {}, field.fields))
        .filter((entry) => Object.keys(entry).length > 0)
      return entries.length > 0 || field.required ? entries : undefined
    }
  }
}

/** The object with each known field cleaned. Anything else it holds is kept as it is, so nothing is lost by saving. */
function cleanObject(source: Record<string, unknown>, fields: Field[]): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source }
  for (const field of fields) {
    const cleaned = cleanField(source[field.key], field)
    if (cleaned === undefined) delete result[field.key]
    else result[field.key] = cleaned
  }
  return result
}

/** A block as it is stored: empty fields left out. A block of a type the editor does not know is returned untouched. */
export function cleanBlock(block: Block): Block {
  const schema = schemaFor(block.type)
  return schema ? cleanObject(block, schema.fields) : block
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** Checks one field; `required` is whether it must be filled (a sub-field of a group nobody uses is not). */
function validateField(
  value: unknown,
  field: Field,
  path: string,
  required: boolean,
  errors: Record<string, string>,
): void {
  switch (field.kind) {
    case 'text':
    case 'textarea': {
      const text = textOf(value)
      if (text === '') {
        if (required && field.required) errors[path] = `Enter the ${lower(field.label)}.`
      } else if (text.length > field.max) {
        errors[path] = `Use ${field.max} characters or fewer.`
      } else if (field.check === 'link' && !SAFE_LINK.test(text)) {
        errors[path] = 'Start with https://, / for a page on this site, mailto: or tel:.'
      } else if (field.check === 'image' && !SAFE_IMAGE.test(text)) {
        errors[path] = 'Start with https://, or / for a file on this site.'
      }
      return
    }
    case 'group': {
      const source = isRecord(value) ? value : {}
      const used = cleanField(source, field) !== undefined
      if (!used && !(required && field.required)) return
      for (const sub of field.fields) {
        validateField(source[sub.key], sub, `${path}.${sub.key}`, true, errors)
      }
      return
    }
    case 'list': {
      const entries = Array.isArray(value) ? value : []
      entries.forEach((entry, index) => {
        const source = isRecord(entry) ? entry : {}
        if (Object.keys(cleanObject(source, field.fields)).length === 0) return // left out when saving
        for (const sub of field.fields) {
          validateField(source[sub.key], sub, `${path}.${index}.${sub.key}`, true, errors)
        }
      })
      return
    }
    default:
      return
  }
}

/**
 * What must be fixed before these blocks can be saved, by field: the key is the block's `key`, then
 * the field's path (`7.primaryAction.href`, `7.items.1.title`), and the value is the message. A block
 * of a type the editor does not know is not checked: it is saved as it was.
 */
export function validateBlocks(drafts: { key: number; block: Block }[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const { key, block } of drafts) {
    const schema = schemaFor(block.type)
    if (!schema) continue
    for (const field of schema.fields) {
      validateField(block[field.key], field, `${key}.${field.key}`, true, errors)
    }
  }
  return errors
}

/** The value written with its object keys in a fixed order, so two equal values read the same whatever order their keys came in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Whether two lists of blocks hold the same thing. The server returns an object's keys in its own order, so a plain text comparison would see a change where there is none. */
export const sameBlocks = (a: unknown[], b: unknown[]): boolean => canonical(a) === canonical(b)
