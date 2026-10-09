import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Globe, House, LayoutDashboard, Menu, Pin, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { Membership, User } from './api.ts'
import EditPage from './EditPage.tsx'
import { listPath, pluralLabel } from './helpers.ts'
import { confirmLeaving } from './leave-guard.ts'
import NewPage from './NewPage.tsx'
import NewSite from './NewSite.tsx'
import NotFound from './NotFound.tsx'
import Overview from './Overview.tsx'
import { fetchTypes } from './pages-api.ts'
import type { PageType } from './pages-api.ts'
import PagesList from './PagesList.tsx'
import { selectSite, signOut } from './session.ts'
import { external, siteUrl } from './site-links.ts'
import Sites from './Sites.tsx'
import { useSignedIn } from './useSignedIn.ts'

type Props = { user: User; memberships: Membership[]; siteId: string | null }

/**
 * The signed-in frame, laid out as WordPress lays out its admin: a dark bar across the top (the site
 * you are working on, New site, who you are) and a dark menu down the left. The menu offers only what
 * works: the Dashboard, one entry per content type of the site, and Sites.
 */
export default function Shell({ user, memberships, siteId }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const current = memberships.find((membership) => membership.site.id === siteId) ?? null
  // The phone layout hides the menu behind a button; following a link closes it again.
  const [menuOpen, setMenuOpen] = useState(false)
  const [openedAt, setOpenedAt] = useState(location)
  if (openedAt !== location) {
    setOpenedAt(location)
    setMenuOpen(false)
  }

  function changeSite(id: string) {
    // Another site's screens replace this one at once, so unsaved changes are asked about first.
    if (!confirmLeaving()) return
    selectSite(id)
    // A page belongs to one site, so leave it for the list.
    if (location.pathname.startsWith('/pages/')) navigate('/pages')
  }

  return (
    <div className={menuOpen ? 'wp menu-open' : 'wp'}>
      <header className="adminbar">
        <button
          type="button"
          className="adminbar-item menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="adminmenu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu aria-hidden="true" size={20} />
          <span className="screen-reader-text">Menu</span>
        </button>
        {memberships.length > 1 && siteId !== null ? (
          <div className="adminbar-item switcher">
            <House aria-hidden="true" size={18} />
            <label htmlFor="site" className="screen-reader-text">
              Site
            </label>
            <select id="site" value={siteId} onChange={(event) => changeSite(event.target.value)}>
              {memberships.map((membership) => (
                <option key={membership.site.id} value={membership.site.id}>
                  {membership.site.name} · {membership.role.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          current && (
            <span className="adminbar-item site-name">
              <House aria-hidden="true" size={18} />
              {current.site.name}
            </span>
          )
        )}
        {current?.site.primaryHost && (
          <a className="adminbar-item" href={siteUrl(current.site.primaryHost)} {...external}>
            <ExternalLink aria-hidden="true" size={16} />
            <span className="adminbar-label">Visit Site</span>
          </a>
        )}
        <Link className="adminbar-item" to="/sites/new">
          <Plus aria-hidden="true" size={18} />
          <span className="adminbar-label">New site</span>
        </Link>
        <div className="adminbar-end">
          <span className="adminbar-item user">
            Howdy, <strong>{user.name}</strong>
          </span>
          <button
            type="button"
            className="adminbar-item"
            onClick={() => confirmLeaving() && signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <AdminMenu key={current?.site.id ?? 'none'} hasSite={current !== null} />

      <div className="wp-content">
        <Routes>
          {/* About the person, not one site, so a person with no sites can reach them. */}
          <Route path="/sites" element={<Sites memberships={memberships} siteId={siteId} />} />
          <Route path="/sites/new" element={<NewSite />} />
          {current && (
            <>
              {/* Keyed by site, so changing site loads that site's pages from scratch. */}
              <Route path="/" element={<Overview user={user} membership={current} />} />
              <Route path="/pages" element={<PagesList key={current.site.id} />} />
              <Route path="/pages/new" element={<NewPage key={current.site.id} />} />
              <Route path="/pages/:id" element={<EditPage key={current.site.id} />} />
            </>
          )}
          <Route path="*" element={current ? <NotFound /> : <NoSites />} />
        </Routes>
      </div>
    </div>
  )
}

type Entry = {
  label: string
  to: string
  icon: LucideIcon
  current: boolean
  sub: { label: string; to: string; current: boolean }[]
}

/** The left menu. Keyed by site by its parent, so another site's content types are loaded afresh. */
function AdminMenu({ hasSite }: { hasSite: boolean }) {
  const location = useLocation()
  const { canCreate } = useSignedIn()
  // null: the types could not be loaded, so one entry lists every type instead.
  const [types, setTypes] = useState<PageType[] | null | undefined>(undefined)

  useEffect(() => {
    if (!hasSite) return
    let cancelled = false
    fetchTypes()
      .then((found) => {
        if (!cancelled) setTypes(found)
      })
      .catch(() => {
        if (!cancelled) setTypes(null)
      })
    return () => {
      cancelled = true
    }
  }, [hasSite])

  const path = location.pathname
  const typeParam = new URLSearchParams(location.search).get('type')
  const onContent = path === '/pages' || path === '/pages/new'

  const entries: Entry[] = []
  if (hasSite) {
    entries.push({ label: 'Dashboard', to: '/', icon: LayoutDashboard, current: path === '/', sub: [] })
    if (types === null) {
      entries.push({
        label: 'Content',
        to: listPath(),
        icon: FileText,
        current: path.startsWith('/pages'),
        sub: [],
      })
    }
    for (const type of types ?? []) {
      const plural = pluralLabel(type.name)
      const mine = onContent && typeParam === type.slug
      entries.push({
        label: plural,
        to: listPath(type.slug),
        icon: type.slug === 'post' ? Pin : FileText,
        current: mine,
        sub: [
          { label: `All ${plural}`, to: listPath(type.slug), current: mine && path === '/pages' },
          ...(canCreate
            ? [
                {
                  label: 'Add New',
                  to: `/pages/new?type=${encodeURIComponent(type.slug)}`,
                  current: mine && path === '/pages/new',
                },
              ]
            : []),
        ],
      })
    }
  }
  entries.push({
    label: 'Sites',
    to: '/sites',
    icon: Globe,
    current: path.startsWith('/sites'),
    sub: [
      { label: 'All Sites', to: '/sites', current: path === '/sites' },
      { label: 'Add New', to: '/sites/new', current: path === '/sites/new' },
    ],
  })

  return (
    <nav id="adminmenu" className="adminmenu" aria-label="Main">
      <ul>
        {entries.map((entry) => (
          <li key={entry.label} className={entry.current ? 'current' : undefined}>
            <Link
              to={entry.to}
              className="menu-top"
              aria-current={entry.current && entry.sub.length === 0 ? 'page' : undefined}
            >
              <entry.icon aria-hidden="true" size={20} />
              <span className="menu-name">{entry.label}</span>
            </Link>
            {entry.current && entry.sub.length > 0 && (
              <ul className="submenu">
                {entry.sub.map((item) => (
                  <li key={item.label}>
                    <Link to={item.to} aria-current={item.current ? 'page' : undefined}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

function NoSites() {
  return (
    <main>
      <h1>No sites yet</h1>
      <p>Your account is not a member of any site. Ask an administrator to add you.</p>
    </main>
  )
}
