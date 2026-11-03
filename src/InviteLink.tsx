import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { formatMoment } from './helpers.ts'
import { inviteLink } from './members-api.ts'
import type { IssuedInvitation } from './members-api.ts'

type Props = {
  issued: IssuedInvitation
  /** It replaced an earlier link, which the person may already have sent. */
  renewed?: boolean
}

/** One invitation's link: who it is for, what they join, until when. */
export default function InviteLink({ issued, renewed = false }: Props) {
  const { invitation, token } = issued
  return (
    <InviteLinkBox email={invitation.email} link={inviteLink(token)}>
      <p>
        Send this link to them. They join as {invitation.role.name}. It works once, until{' '}
        {formatMoment(invitation.expiresAt)}, and this is the only time it is shown.
      </p>
      {renewed && <p>The earlier link stops working.</p>}
    </InviteLinkBox>
  )
}

/**
 * An invite's link, to copy and send (WhatsApp, Slack; nothing is emailed). The API keeps only a
 * fingerprint of it, so this is the one time it can be shown. Key it by the link: another link is
 * another box, with nothing "Copied" yet. `children` say what the link is for. The company team's Add
 * person uses it directly, for a link that carries several websites' secrets.
 *
 * It opens in view and with Copy focused, wherever on a long list its button was (QA lesson 2026-10-09).
 */
export function InviteLinkBox({
  email,
  link,
  children,
}: {
  email: string
  link: string
  children: ReactNode
}) {
  const box = useRef<HTMLElement>(null)
  const copyButton = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState<boolean | null>(null)

  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' })
    copyButton.current?.focus({ preventScroll: true })
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Refused, or a page not on https, where browsers have no clipboard to write to.
      setCopied(false)
    }
  }

  return (
    <section ref={box} className="postbox invite-link" aria-labelledby="invite-link-heading">
      <h2 id="invite-link-heading" className="postbox-title">
        Invite link for {email}
      </h2>
      <div className="postbox-inside form-stack">
        {children}
        <div className="invite-link-row">
          <code>{link}</code>
          <button ref={copyButton} type="button" onClick={() => void copy()}>
            Copy
          </button>
        </div>
        {copied === true && (
          <p role="status" className="hint">
            Copied
          </p>
        )}
        {copied === false && (
          <p role="alert" className="form-error">
            Couldn’t copy it. Select the link and copy it yourself.
          </p>
        )}
      </div>
    </section>
  )
}
