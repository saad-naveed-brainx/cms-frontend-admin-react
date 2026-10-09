import { BlockRenderer } from '@/blocks/BlockRenderer'
import { parseBlocks } from '@/blocks/parse-blocks'
import { resolveTheme } from '@/site/resolve-theme'
import { SiteThemeRoot } from '@/theme/SiteThemeRoot'
import PreviewFrame from './PreviewFrame.tsx'

type Props = {
  /** The blocks as they would be saved (empty fields already left out). */
  blocks: unknown[]
  /** The site's stored theme, laid over the default as the website does. */
  theme: unknown
}

/**
 * "What visitors will see": the page's blocks drawn by the website's own components (copied from
 * web, src/site-blocks, D-030) in the site's theme, updated as the forms change. A block the website
 * would leave out (a required field still empty) is left out here too.
 */
export default function LivePreview({ blocks, theme }: Props) {
  const drawn = parseBlocks(blocks)
  const hidden = blocks.length - drawn.length

  return (
    <PreviewFrame
      heading="What visitors will see"
      frameTitle="Live preview of this page"
      notes={
        <>
          {blocks.length === 0 && (
            <p className="hint live-preview-note">
              No blocks yet: add one and it shows here as you fill it in.
            </p>
          )}
          {hidden > 0 && (
            <p className="hint live-preview-note">
              {hidden === 1 ? '1 block is' : `${hidden} blocks are`} not shown: the site leaves out
              a block whose required fields are empty, and rich text for now.
            </p>
          )}
        </>
      }
    >
      <SiteThemeRoot theme={resolveTheme(theme)} className="min-h-screen">
        <BlockRenderer blocks={drawn} />
      </SiteThemeRoot>
    </PreviewFrame>
  )
}
