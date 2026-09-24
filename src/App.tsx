const apiUrl = import.meta.env.VITE_API_URL ?? 'not configured'

function App() {
  return (
    <main>
      <p className="eyebrow">apps/admin</p>
      <h1>Admin panel</h1>
      <p>
        Single-page admin for the multi-tenant CMS: content editing, block
        editor, media, and per-site settings.
      </p>
      <p className="mono">API: {apiUrl}</p>
    </main>
  )
}

export default App
