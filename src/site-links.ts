/**
 * Links from the admin to the public website. A site's address comes from sign-in
 * (`site.primaryHost`, e.g. `cafe.example.com`); how it is reached comes from two settings, because
 * on this machine the website runs on its own port: `VITE_SITE_SCHEME` (`http` or `https`, default
 * `https`) and `VITE_SITE_PORT` (digits, default none). In production neither is set, so the link is
 * `https://cafe.example.com/`; locally it is `http://cafe.localhost:3000/`.
 */

const scheme = import.meta.env.VITE_SITE_SCHEME === 'http' ? 'http' : 'https'
const port = /^\d{1,5}$/.test(String(import.meta.env.VITE_SITE_PORT ?? ''))
  ? `:${import.meta.env.VITE_SITE_PORT}`
  : ''

/** The public address of a page: the home page (`/home`) is the site's front page, `/`. */
export function siteUrl(host: string, path = '/'): string {
  const shown = path === '/home' ? '/' : path
  return `${scheme}://${host}${port}${shown.startsWith('/') ? shown : `/${shown}`}`
}

/** A page opened through a preview link: the page's own address, with the link's token. */
export function previewUrl(host: string, path: string, token: string): string {
  return `${siteUrl(host, path)}?preview=${encodeURIComponent(token)}`
}

/** What every link to the website carries: it opens in a new tab, and the website gets no hold on the admin. */
export const external = { target: '_blank', rel: 'noopener noreferrer' } as const
