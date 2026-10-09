import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import App from './App.tsx'

/**
 * One catch-all route around the app, whose own `<Routes>` (Shell.tsx) do the routing as before. It
 * is a data router only so the edit screen can hold back a navigation that would lose unsaved
 * changes (`useBlocker`, which the plain `<BrowserRouter>` does not offer).
 */
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
