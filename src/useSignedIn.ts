import { useSession } from './session.ts'

// The permission names the API grants (api/src/auth/permission.ts). The screens use them only to
// decide what to offer: the API decides what is allowed (admin invariant 3).
const CONTENT_CREATE = 'content.create'
const CONTENT_EDIT_ANY = 'content.edit_any'
const CONTENT_EDIT_OWN = 'content.edit_own'
const CONTENT_PUBLISH = 'content.publish'

/** Who is signed in and what their role on the current site lets the screens offer. */
export function useSignedIn() {
  const state = useSession()
  if (state.status !== 'signed-in') {
    // These screens only exist inside the signed-in frame; a sign-out replaces them in the same update.
    return {
      userId: null,
      siteHost: null,
      canCreate: false,
      canPublish: false,
      mayEdit: (_createdBy: string | null) => false,
    }
  }

  const membership = state.memberships.find((m) => m.site.id === state.siteId)
  const permissions = membership?.permissions ?? []
  return {
    userId: state.user.id,
    /** The current site's main web address, for links to the website; null when it has none. */
    siteHost: membership?.site.primaryHost ?? null,
    canCreate: permissions.includes(CONTENT_CREATE),
    canPublish: permissions.includes(CONTENT_PUBLISH),
    /** Any page with `content.edit_any`; only the person's own pages with `content.edit_own`. */
    mayEdit: (createdBy: string | null) =>
      permissions.includes(CONTENT_EDIT_ANY) ||
      (permissions.includes(CONTENT_EDIT_OWN) && createdBy === state.user.id),
  }
}
