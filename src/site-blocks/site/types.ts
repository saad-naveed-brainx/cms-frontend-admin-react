import type { Block } from '@/blocks/types';
import type { SiteTheme } from '@/theme/theme';

/**
 * Header and footer are per-site rather than per-page, so they live in site
 * settings alongside branding — not in the block system. Only content and
 * branding vary; the layout is fixed.
 */
export type SiteSettings = {
  /** Wordmark text. A logo image replaces this once media exists. */
  name: string;
  /** Short line beside the wordmark. Empty until sites can set one. */
  tagline: string;
  /** The site's main web address. */
  host: string;
  nav: { label: string; href: string }[];
  footer: {
    note: string;
    groups: { title: string; links: { label: string; href: string }[] }[];
  };
  theme: SiteTheme;
};

export type SitePage = {
  path: string;
  title: string;
  blocks: Block[];
};

/** Everything one page of one site is drawn from. */
export type SiteView = {
  settings: SiteSettings;
  page: SitePage;
};
