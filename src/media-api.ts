import { ApiError, isRecord } from './api.ts'
import { authed } from './session.ts'

/**
 * The site's media library, as the admin uses it (api/src/media/, D-042). Each answer is checked
 * for the fields the screen reads; anything else is treated as a failure.
 */

export type MediaItem = {
  id: string
  filename: string
  /** The full address of the picture, on the API (`http://localhost:4001/uploads/…`). */
  url: string
  /** Its 480-pixel copy, for the grid. */
  thumbUrl: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: string
}

export type MediaPage = { items: MediaItem[]; total: number }

/** What the API takes: JPEG, PNG or WebP, up to 10 MB (it checks again). */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const PAGE_SIZE = 40

const unusable = () => new ApiError(502)

const size = (value: unknown) => value === null || typeof value === 'number'

export function isMediaItem(value: unknown): value is MediaItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.url === 'string' &&
    typeof value.thumbUrl === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.sizeBytes === 'number' &&
    size(value.width) &&
    size(value.height) &&
    typeof value.createdAt === 'string'
  )
}

/** One page of the site's pictures, newest first. */
export async function fetchMedia(offset = 0): Promise<MediaPage> {
  const answer = await authed(`/media?limit=${PAGE_SIZE}&offset=${offset}`)
  if (
    !isRecord(answer) ||
    typeof answer.total !== 'number' ||
    !Array.isArray(answer.items) ||
    !answer.items.every(isMediaItem)
  ) {
    throw unusable()
  }
  return { items: answer.items, total: answer.total }
}

/** Uploads one picture to the site and answers with it as stored. */
export async function uploadMedia(file: File): Promise<MediaItem> {
  const form = new FormData()
  form.append('file', file)
  const answer = await authed('/media', { method: 'POST', body: form })
  if (!isMediaItem(answer)) throw unusable()
  return answer
}

/** "1.2 MB", "340 KB". */
export function readableSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
