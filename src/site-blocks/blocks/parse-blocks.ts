import { isRecord } from '@/lib/guards';
import type { Block, BlockOfType, BlockType, ImageRef, LinkRef } from './types';

/**
 * A page's `blocks` come from the database as stored, and the API only checks that each is an
 * object with a `type` (CNT-01). So before anything is drawn, each block is read field by field:
 * a block of a type this site does not know, or missing what it cannot be drawn without, is left
 * out and the rest of the page still shows (invariant 6). Nothing here throws.
 */

/** Where a link may point: this site, another web address, an email or a phone number. Not `javascript:`. */
const SAFE_LINK = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;
/** Where an image may load from: a web address or this site's own files. */
const SAFE_IMAGE = /^(?:https?:\/\/|\/(?!\/))/i;

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function link(value: unknown): LinkRef | undefined {
  if (!isRecord(value)) return undefined;
  const label = text(value.label);
  const href = text(value.href);
  return label !== undefined && href !== undefined && SAFE_LINK.test(href) ? { label, href } : undefined;
}

function image(value: unknown): ImageRef | undefined {
  if (!isRecord(value)) return undefined;
  const src = text(value.src);
  const alt = text(value.alt);
  if (src === undefined || alt === undefined || !SAFE_IMAGE.test(src)) return undefined;
  return { src, alt, caption: text(value.caption) };
}

/** The entries of a list that `parse` can read, in order; a value that is not a list is an empty one. */
function entries<T>(value: unknown, parse: (entry: Record<string, unknown>) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const read: T[] = [];
  for (const entry of value) {
    const one = isRecord(entry) ? parse(entry) : undefined;
    if (one !== undefined) read.push(one);
  }
  return read;
}

type Parsers = { [T in BlockType]: (raw: Record<string, unknown>) => BlockOfType<T> | undefined };

/** One reader per block type, so a type added to `Block` without one is a compile error. */
const parsers: Parsers = {
  hero: (raw) => {
    const headline = text(raw.headline);
    if (headline === undefined) return undefined;
    return {
      type: 'hero',
      headline,
      eyebrow: text(raw.eyebrow),
      body: text(raw.body),
      primaryAction: link(raw.primaryAction),
      secondaryAction: link(raw.secondaryAction),
      image: image(raw.image),
      facts: entries(raw.facts, (fact) => {
        const label = text(fact.label);
        const value = text(fact.value);
        return label !== undefined && value !== undefined ? { label, value } : undefined;
      }),
    };
  },

  // Never drawn for now: its HTML is meant to be cleaned when it is saved (BLK-05), and nothing
  // cleans it yet, so what is stored cannot be trusted as markup. See docs/DECISIONS.md D-021.
  richText: () => undefined,

  imageText: (raw) => {
    const heading = text(raw.heading);
    const body = text(raw.body);
    const picture = image(raw.image);
    if (heading === undefined || body === undefined || picture === undefined) return undefined;
    return {
      type: 'imageText',
      heading,
      body,
      image: picture,
      imagePosition: raw.imagePosition === 'right' ? 'right' : 'left',
      action: link(raw.action),
    };
  },

  featureGrid: (raw) => ({
    type: 'featureGrid',
    heading: text(raw.heading),
    intro: text(raw.intro),
    ordered: raw.ordered === true,
    items: entries(raw.items, (item) => {
      const title = text(item.title);
      const body = text(item.body);
      return title !== undefined && body !== undefined
        ? { title, body, label: text(item.label) }
        : undefined;
    }),
  }),

  testimonial: (raw) => {
    const quote = text(raw.quote);
    const attribution = text(raw.attribution);
    if (quote === undefined || attribution === undefined) return undefined;
    return { type: 'testimonial', quote, attribution, role: text(raw.role) };
  },

  cta: (raw) => {
    const heading = text(raw.heading);
    const action = link(raw.action);
    if (heading === undefined || action === undefined) return undefined;
    return { type: 'cta', heading, action, body: text(raw.body), note: text(raw.note) };
  },
};

/** The blocks of a stored page that can be drawn, in their stored order. */
export function parseBlocks(stored: unknown[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of stored) {
    if (!isRecord(entry) || typeof entry.type !== 'string' || !Object.hasOwn(parsers, entry.type)) continue;
    const parse = parsers[entry.type as BlockType] as (raw: Record<string, unknown>) => Block | undefined;
    const block = parse(entry);
    if (block) blocks.push(block);
  }
  return blocks;
}
