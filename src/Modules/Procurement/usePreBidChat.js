/**
 * One pre bid's chat, for the company side - or, given `vendorEmail`, for that
 * vendor in the vendor portal (its own conversation only, written as "vendor"):
 *
 *   const chat = usePreBidChat({ companyId, preBidId })
 *   const chat = usePreBidChat({ preBidId, vendorEmail })
 *
 *   threads        { key: { email, messages } } - see preBidChat.readThreads
 *   status/error   of the load, as useQuery's
 *   reload()       loads every conversation again
 *   live           true while the socket is open - a reply shows up by itself
 *   send(email, text)  saves a message; true when it was saved
 *   sending        true while one is on its way
 *
 * Messages are saved and loaded with POST procurement/pre_bid_chat/; the socket
 * (ws/pre_bid_chat/<id>/, useLiveSocket) only pushes each one as it is saved;
 * on "connected" everything is loaded again, so nothing sent while the socket
 * was down is missed.
 *
 * Without a socket the chat still works: Refresh loads it again.
 */

import { useMemo, useState } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { useQuery } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { mergeLive, readSocketMessage, readThreads } from '@/Modules/Procurement/preBidChat'
import useLiveSocket from '@/Modules/Procurement/useLiveSocket'
import { getPreBidChats, preBidChatSocketUrl, sendPreBidChat } from '@/Services/Procurement/procurementAutomationService'
import { getVendorPreBidChat, sendVendorPreBidChat, vendorPreBidChatSocketUrl } from '@/Services/Procurement/vendorPortalService'

const NO_THREADS = {}

export default function usePreBidChat({ companyId, preBidId, vendorEmail = null }) {
  const enabled = preBidId !== null && preBidId !== undefined

  const chats = useQuery({
    key: enabled ? [QUERY.PRE_BID_CHAT, vendorEmail ? `vendor:${vendorEmail}` : companyId, preBidId] : null,
    fetch: () =>
      (vendorEmail ? getVendorPreBidChat(preBidId, vendorEmail) : getPreBidChats(preBidId)).then(readThreads),
  })

  const [pushes, setPushes] = useState([])
  const [sending, setSending] = useState(false)

  const live = useLiveSocket({
    id: enabled ? `chat:${vendorEmail ?? ''}:${preBidId}` : null,
    url: () => (vendorEmail ? vendorPreBidChatSocketUrl(preBidId, vendorEmail) : preBidChatSocketUrl(preBidId)),
    onConnected: () => chats.reload(),
    onMessage: (data) => {
      const push = readSocketMessage(data)
      if (push) setPushes((previous) => [...previous, push])
    },
  })

  const threads = useMemo(() => mergeLive(chats.data ?? NO_THREADS, pushes), [chats.data, pushes])

  /**
   * Saved, the conversations are loaded again rather than the message being
   * added here: the socket pushes it back too, and the load and `seq` agree
   * on where it goes, so it is shown once.
   */
  const send = async (threadEmail, text) => {
    setSending(true)
    try {
      if (vendorEmail) await sendVendorPreBidChat({ preBidId, vendorEmail, message: text })
      else
        await sendPreBidChat({
          preBidId,
          vendorEmail: threadEmail,
          message: text,
        })
      await chats.reload()
      return true
    } catch (failure) {
      toast.error(failure.message)
      return false
    } finally {
      setSending(false)
    }
  }

  return {
    threads,
    status: chats.status,
    error: chats.error,
    reload: chats.reload,
    live,
    send,
    sending,
  }
}
