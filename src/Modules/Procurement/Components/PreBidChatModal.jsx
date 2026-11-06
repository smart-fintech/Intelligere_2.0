import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronRight, RefreshCw, SendHorizontal, X } from 'lucide-react'

import { InlineAlert, ListSkeleton, RetryButton } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { Textarea } from '@/Components/ui/textarea'
import { cn } from '@/Library/utils'
import { showSentAt, threadKey } from '@/Modules/Procurement/preBidChat'
import { collectVendors } from '@/Modules/Procurement/procurement'
import usePreBidChat from '@/Modules/Procurement/usePreBidChat'

/**
 * A Pre Bid's chat, in the old portal's drawer: a panel floating over the
 * right of the page, which stays readable (and usable) behind it.
 *
 *   the vendor list   the Pre Bid's vendors, then any other email the chat
 *                     holds a conversation for (a vendor without an email
 *                     cannot be written to - the chat is kept by email)
 *   a conversation    opened by picking a vendor; the back arrow returns to
 *                     the list, the X closes the drawer
 *
 * In the vendor portal (`vendorEmail` given) it opens straight on the
 * vendor's one conversation with the company, with no list behind it.
 *
 * Messages are labelled by side ("buyer" / "vendor") with their time, the
 * viewer's own on the right. `canSend` is false once the Pre Bid has closed or
 * been cancelled: the conversations stay readable. Escape closes it.
 */

const NO_MESSAGES = []

export default function PreBidChatModal({ event, companyId, vendorEmail = null, canSend, onClose }) {
  const asVendor = Boolean(vendorEmail)
  const chat = usePreBidChat({ companyId, preBidId: event.id, vendorEmail })
  // The open conversation's key; null shows the vendor list.
  const [selected, setSelected] = useState(asVendor ? threadKey(vendorEmail) : null)
  const [draft, setDraft] = useState('')
  const threadRef = useRef(null)
  const composerRef = useRef(null)

  const conversations = useMemo(() => {
    if (asVendor) return [{ key: threadKey(vendorEmail), email: vendorEmail, name: event.company_name || 'Buyer' }]
    const seen = new Set()
    const list = []
    collectVendors(event.product).forEach((vendor) => {
      const key = threadKey(vendor.email)
      if (!key || seen.has(key)) return
      seen.add(key)
      list.push({ key, email: vendor.email, name: vendor.name || vendor.email })
    })
    Object.entries(chat.threads).forEach(([key, thread]) => {
      if (seen.has(key)) return
      seen.add(key)
      list.push({ key, email: thread.email, name: thread.email })
    })
    return list
  }, [asVendor, vendorEmail, event.company_name, event.product, chat.threads])

  const active = conversations.find((conversation) => conversation.key === selected) ?? null
  const messages = (active && chat.threads[active.key]?.messages) || NO_MESSAGES

  // A new message, or another conversation opened, shows the latest at the bottom.
  useEffect(() => {
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [messages, active?.key])

  // Opening a conversation puts the cursor in its message box.
  useEffect(() => {
    if (active) composerRef.current?.focus()
  }, [active])

  // Escape closes the drawer, as it would a dialog.
  useEffect(() => {
    const onKeyDown = (keyEvent) => {
      if (keyEvent.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const open = (key) => {
    setSelected(key)
    setDraft('')
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !active || chat.sending) return
    if (await chat.send(active.email, text)) setDraft('')
  }

  const loading = chat.status === 'loading' && Object.keys(chat.threads).length === 0
  const ownSide = asVendor ? 'vendor' : 'buyer'

  return createPortal(
    <aside
      role="dialog"
      aria-label={active ? `Chat with ${active.name}` : 'Vendor chat'}
      className="fixed right-4 bottom-4 z-50 flex h-[min(36rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        {active && !asVendor ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon={ArrowLeft}
            tooltip="Back to the vendor list"
            aria-label="Back to the vendor list"
            onClick={() => open(null)}
          />
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-base font-semibold text-brand" title={active?.name}>
            {active ? active.name : 'Vendor Chat'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{event.Auction_no}</p>
        </div>
        {chat.live ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            icon={RefreshCw}
            tooltip="Not live - refresh to see new replies"
            aria-label="Refresh the chat"
            loading={chat.status === 'loading' && !loading}
            onClick={chat.reload}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          icon={X}
          tooltip="Close"
          aria-label="Close the chat"
          onClick={onClose}
        />
      </header>

      {chat.status === 'failed' ? (
        <div className="px-3 pt-3">
          <InlineAlert action={<RetryButton onClick={chat.reload} />}>{chat.error}</InlineAlert>
        </div>
      ) : null}

      {active ? (
        <>
          <div
            ref={threadRef}
            className="m-3 mb-0 min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-md border border-border bg-brand-soft/30 p-3"
          >
            {loading ? (
              <ListSkeleton rows={3} />
            ) : messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No message yet. Start the conversation about this pre bid.
              </p>
            ) : (
              messages.map((message) => {
                const side = message.fromVendor ? 'vendor' : 'buyer'
                const mine = side === ownSide
                return (
                  <div key={message.seq} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-lg border px-3 py-2 shadow-xs',
                        mine ? 'border-brand/15 bg-brand-soft' : 'border-border bg-card',
                      )}
                    >
                      <p className="text-[11px] text-muted-foreground">
                        {side} &middot; {showSentAt(message.sentAt)}
                      </p>
                      <p className="mt-0.5 text-sm break-words whitespace-pre-line text-foreground">{message.text}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {canSend ? (
            <div className="mt-3 flex items-center gap-2 border-t border-border p-3">
              <Textarea
                ref={composerRef}
                rows={2}
                aria-label="Message"
                placeholder="Write a message and press Enter to send"
                value={draft}
                disabled={chat.sending}
                onChange={(changeEvent) => setDraft(changeEvent.target.value)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
                    keyEvent.preventDefault()
                    handleSend()
                  }
                }}
                className="max-h-32 min-h-0 flex-1 resize-none rounded-2xl bg-muted/40"
              />
              <Button
                type="button"
                icon={SendHorizontal}
                loading={chat.sending}
                disabled={!draft.trim()}
                aria-label="Send message"
                tooltip="Send"
                onClick={handleSend}
                className="size-10 shrink-0 rounded-full border-0 bg-brand p-0 text-brand-foreground hover:bg-brand-dark hover:text-brand-foreground"
              />
            </div>
          ) : (
            <p className="mt-3 border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
              This pre bid is {event.cancelled ? 'cancelled' : 'closed'} - the chat is read only.
            </p>
          )}
        </>
      ) : conversations.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No vendor is attached to this pre bid yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-label="Vendors">
          {conversations.map((conversation) => {
            const count = chat.threads[conversation.key]?.messages.length ?? 0
            return (
              <li key={conversation.key}>
                <button
                  type="button"
                  onClick={() => open(conversation.key)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none hover:bg-brand-soft/50 focus-visible:bg-brand-soft/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{conversation.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{conversation.email}</span>
                  </span>
                  {count > 0 ? (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {count} {count === 1 ? 'message' : 'messages'}
                    </span>
                  ) : null}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>,
    document.body,
  )
}
