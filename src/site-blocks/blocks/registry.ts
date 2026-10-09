import type { ComponentType } from 'react';
import type { Block, BlockOfType, BlockType } from './types';
import { Cta } from './Cta';
import { FeatureGrid } from './FeatureGrid';
import { Hero } from './Hero';
import { ImageText } from './ImageText';
import { RichText } from './RichText';
import { Testimonial } from './Testimonial';

export type BlockComponent<T extends BlockType> = ComponentType<{ block: BlockOfType<T> }>;

type Registry = { [T in BlockType]: BlockDefinition<T> };

export type BlockDefinition<T extends BlockType> = {
  /** Shown in the editor's block picker. */
  name: string;
  component: BlockComponent<T>;
};

/**
 * The single source of truth for which blocks exist. Adding a block type to
 * `Block` without registering it here is a compile error, and vice versa.
 */
export const blockRegistry: Registry = {
  hero: { name: 'Hero', component: Hero },
  richText: { name: 'Rich text', component: RichText },
  imageText: { name: 'Image and text', component: ImageText },
  featureGrid: { name: 'Feature grid', component: FeatureGrid },
  testimonial: { name: 'Testimonial', component: Testimonial },
  cta: { name: 'Call to action', component: Cta },
};

export const blockTypes = Object.keys(blockRegistry) as BlockType[];

export function getBlockComponent(block: Block): BlockComponent<BlockType> {
  return blockRegistry[block.type].component as BlockComponent<BlockType>;
}
