/**
 * Block definitions.
 *
 * Blocks are code-defined, not user-definable: each block is one React
 * component rendered both by the editor canvas and by the public site, so the
 * preview is the same component tree rather than an approximation. These types
 * are the contract for the `blocks` JSONB column on `content`.
 */

export type ImageRef = {
  src: string;
  alt: string;
  /** Optional caption rendered beneath the image where the block supports it. */
  caption?: string;
};

export type LinkRef = {
  label: string;
  href: string;
};

export type HeroBlock = {
  type: 'hero';
  eyebrow?: string;
  headline: string;
  body?: string;
  primaryAction?: LinkRef;
  secondaryAction?: LinkRef;
  image?: ImageRef;
  /** Facts shown under the hero copy; keep to three or fewer. */
  facts?: { label: string; value: string }[];
};

export type RichTextBlock = {
  type: 'richText';
  heading?: string;
  /** Sanitised on write, never on read. */
  html: string;
};

export type ImageTextBlock = {
  type: 'imageText';
  heading: string;
  body: string;
  image: ImageRef;
  imagePosition: 'left' | 'right';
  action?: LinkRef;
};

export type FeatureGridBlock = {
  type: 'featureGrid';
  heading?: string;
  intro?: string;
  /**
   * `ordered` renders sequence markers. Only set it when the items really are
   * a sequence — a numbered list of unrelated capabilities reads as decoration.
   */
  ordered?: boolean;
  items: { label?: string; title: string; body: string }[];
};

export type TestimonialBlock = {
  type: 'testimonial';
  quote: string;
  attribution: string;
  role?: string;
};

export type CtaBlock = {
  type: 'cta';
  heading: string;
  body?: string;
  action: LinkRef;
  note?: string;
};

export type Block =
  | HeroBlock
  | RichTextBlock
  | ImageTextBlock
  | FeatureGridBlock
  | TestimonialBlock
  | CtaBlock;

export type BlockType = Block['type'];

/** Narrows the union to one member, so registry entries stay type-safe. */
export type BlockOfType<T extends BlockType> = Extract<Block, { type: T }>;
