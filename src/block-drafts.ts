import { isRecord } from './api.ts'
import { schemaFor } from './block-schemas.ts'
import type { Block } from './block-schemas.ts'

/** A block being edited, with a key that stays the same while it moves, so its fields keep their place. */
export type Draft = { key: number; block: Block }

let lastKey = 0

export function newKey(): number {
  lastKey += 1
  return lastKey
}

/** The page's stored blocks as drafts. Anything that is not a block object is kept as an unknown block, not dropped. */
export function draftsFrom(blocks: unknown[]): Draft[] {
  return blocks.map((block) => ({
    key: newKey(),
    block: isRecord(block) ? block : { type: 'unknown' },
  }))
}

/** What a block is called on screen: the editor's own name, or a plain one for a block it cannot edit. */
export function blockName(block: Block): string {
  return schemaFor(block.type)?.name ?? (block.type === 'richText' ? 'Rich text' : 'Unknown block')
}

/** The id of the field at this path (the keys `validateBlocks` gives). */
export const fieldId = (path: string): string => `f-${path.replaceAll('.', '-')}`

/** Puts the cursor in the field a message belongs to. */
export function focusField(path: string): void {
  document.getElementById(fieldId(path))?.focus()
}
