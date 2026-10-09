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
  theme: Record<string, unknown>
}

/** What a save sends: any of the four; the theme is always whole. */
export type AppearanceChange = Partial<Appearance>

function isAppearance(value: unknown): value is Appearance {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.tagline === 'string' &&
    typeof value.footerNote === 'string' &&
    isRecord(value.theme)
  )
}

export async function fetchAppearance(): Promise<Appearance> {
  const answer = await authed('/appearance')
  if (!isAppearance(answer)) throw new ApiError(502)
  return answer
}

export async function saveAppearance(body: AppearanceChange): Promise<Appearance> {
  const answer = await authed('/appearance', { method: 'PATCH', body })
  if (!isAppearance(answer)) throw new ApiError(502)
  return answer
}
