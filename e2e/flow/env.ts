/**
 * Where the real-flow tests find their servers. Shared by playwright.config.ts and the specs.
 *
 * The real API runs on its own port and its own database, so it never touches a dev server or a
 * dev database. A devflow slot sets DEVFLOW_SLOT and the ports; the main checkout uses defaults.
 */
export const adminPort = Number(process.env.DEVFLOW_PORT_ADMIN ?? 5190)
export const flowApiPort = Number(process.env.DEVFLOW_PORT_API ?? 4090) + 500
export const flowApiUrl = `http://127.0.0.1:${flowApiPort}`
export const flowDatabase = process.env.DEVFLOW_SLOT
  ? `cms_wt${process.env.DEVFLOW_SLOT}_flow`
  : 'cms_flow'
