import { ApiError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * A site's appearance as the API keeps it (api/src/appearance/, GOV-04): its name, the tagline beside
 * it in the header, the note in its footer, and its theme as stored (`{}` for a new site; the
 * website lays it over the default).
 */
export type Appearance = {
  name: string
  tagline: string
  footerNote: string
  /** The logo's address (a library picture, MED-03), or `''` for none. */
  logoUrl: string
  theme: Record<string, unknown>
}

/** What a save sends: any of them; the theme is always whole. */
export type AppearanceChange = Partial<Appearance>

function isAppearance(
  value: unknown,
): value is Omit<Appearance, 'logoUrl'> & { logoUrl?: unknown } {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.tagline === 'string' &&
    typeof value.footerNote === 'string' &&
    (value.logoUrl === undefined || typeof value.logoUrl === 'string') &&
    isRecord(value.theme)
  )
}

/** The answer as the screen reads it: no logo is `''`. */
function appearanceOf(answer: unknown): Appearance {
  if (!isAppearance(answer)) throw new ApiError(502)
  return { ...answer, logoUrl: typeof answer.logoUrl === 'string' ? answer.logoUrl : '' }
}

export async function fetchAppearance(): Promise<Appearance> {
  return appearanceOf(await authed('/appearance'))
}

export async function saveAppearance(body: AppearanceChange): Promise<Appearance> {
  return appearanceOf(await authed('/appearance', { method: 'PATCH', body }))
}
