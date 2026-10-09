import type { Block } from './types';
import { getBlockComponent } from './registry';

type Props = {
  blocks: Block[];
};

/**
 * Renders a page's block array in order. An unknown block type is skipped
 * rather than thrown on: a page saved with a block that a later deploy removed
 * must still render the rest of itself.
 */
export function BlockRenderer({ blocks }: Props) {
  return (
    <>
      {blocks.map((block, index) => {
        const Component = getBlockComponent(block);
        if (!Component) return null;
        return <Component key={`${block.type}-${index}`} block={block} />;
      })}
    </>
  );
}
