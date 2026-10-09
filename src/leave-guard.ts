import { useEffect } from 'react'
import { useBlocker } from 'react-router'

/**
 * Asking before unsaved changes are lost. The edit screen says whether it has any; leaving then
 * asks first, however it happens:
 * - a link, Back or Forward, or any other move inside the admin: held back by the router (`useBlocker`);
 * - the site switcher and Sign out, which change what is shown without moving: `confirmLeaving()`;
 * - a reload, closing the tab, or typing another address: the browser asks, in its own words.
 * Kept outside React, like the session, so the top bar can ask too.
 */

export const LEAVE_MESSAGE = 'You have unsaved changes. Leave without saving them?'

let unsaved = false

/** True when it is fine to go: nothing unsaved, or the person said to leave without saving. */
export function confirmLeaving(): boolean {
  if (!unsaved) return true
  if (!window.confirm(LEAVE_MESSAGE)) return false
  unsaved = false
  return true
}

/** Used by the edit screen: while `changed`, leaving asks first. */
export function useLeaveGuard(changed: boolean): void {
  useEffect(() => {
    unsaved = changed
    return () => {
      unsaved = false
    }
  }, [changed])

  // Read when a navigation starts, so a "leave" already confirmed (the site switcher) is not asked again.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(LEAVE_MESSAGE)) {
      unsaved = false
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    if (!changed) return
    const ask = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [changed])
}
