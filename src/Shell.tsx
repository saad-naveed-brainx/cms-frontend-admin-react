import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { Membership, User } from './api.ts'
import EditPage from './EditPage.tsx'
import NewPage from './NewPage.tsx'
import NewSite from './NewSite.tsx'
import NotFound from './NotFound.tsx'
import Overview from './Overview.tsx'
import PagesList from './PagesList.tsx'
import { selectSite, signOut } from './session.ts'

type Props = { user: User; memberships: Membership[]; siteId: string | null }

/** The signed-in frame: who you are, which site you are working on, where to go, and what is there. */
export default function Shell({ user, memberships, siteId }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const current = memberships.find((membership) => membership.site.id === siteId) ?? null

  function changeSite(id: string) {
    selectSite(id)
    // A page belongs to one site, so leave it for the list.
    if (location.pathname.startsWith('/pages/')) navigate('/pages')
  }

  return (
    <>
      <header className="bar">
        <span className="brand">CMS admin</span>
        {current && (
          <nav aria-label="Main">
            <NavLink to="/" end>
              Overview
            </NavLink>
            <NavLink to="/pages">Pages</NavLink>
          </nav>
        )}
        <div className="bar-end">
          {memberships.length > 1 && siteId !== null ? (
            <div className="switcher">
              <label htmlFor="site">Site</label>
              <select id="site" value={siteId} onChange={(event) => changeSite(event.target.value)}>
                {memberships.map((membership) => (
                  <option key={membership.site.id} value={membership.site.id}>
                    {membership.site.name} · {membership.role.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            current && <span className="site-name">{current.site.name}</span>
          )}
          <Link className="button secondary" to="/sites/new">
            New site
          </Link>
          <span className="user">{user.name}</span>
          <button type="button" className="secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <Routes>
        {/* About the person, not one site, so a person with no sites can reach it. */}
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
    </>
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
