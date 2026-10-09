import type { ReactNode } from 'react';
import { BlockRenderer } from '@/blocks/BlockRenderer';
import { SiteThemeRoot } from '@/theme/SiteThemeRoot';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import type { SiteView } from './types';

/**
 * A whole tenant site: theme scope, header and footer from site settings, and
 * the page's blocks in between. Nothing here reads a global colour, so any theme
 * can be laid over the same components. `banner` sits above the header, inside the
 * theme (the preview strip); `children` replaces the blocks (the blog page's list).
 */
export function SiteChrome({
  site,
  banner,
  children,
}: {
  site: SiteView;
  banner?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SiteThemeRoot theme={site.settings.theme} className="flex min-h-full flex-col">
      {banner}
      <SiteHeader settings={site.settings} />
      <main className="flex-1">{children ?? <BlockRenderer blocks={site.page.blocks} />}</main>
      <SiteFooter settings={site.settings} />
    </SiteThemeRoot>
  );
}
