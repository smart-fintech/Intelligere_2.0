/**
 * SEND TO TALLY, then MARK AS SENT - every view's Send, built on useTallySync's
 * send-and-wait as Amount Distribution and Journal Voucher send:
 *
 *   const tally = useTallySendAndMark({ moduleName, companyName, buildMessage, markSent, onSettled })
 *   tally.send([{ invoiceNo, row }])   false when it could not start
 *   tally.busy                         true from the click until marked (or failed)
 *   tally.inFlight                     the invoice numbers going now
 *   tally.unmarked, tally.retryMark()  see below
 *
 *   buildMessage(companyName, rows)    the view's message (Services)
 *   markSent(invoiceNumbers)           the view's PUT ... Invoice_no
 *
 * The invoices are marked sent ONLY when Tally answers status "success" -
 * Tally created every one of them. On "error" nothing is marked and they
 * stay, to be put right and sent again; Tally's own message says which failed.
 *
 * Tally took them but the mark failed: they are in Tally, yet the backend
 * would still offer them. They are kept in `unmarked`, the view locks them,
 * and retryMark() tries the PUT again - they are never offered for a second
 * send, which would put them in Tally twice.
 *
 * One send at a time: a second click while one runs is refused. `onSettled`
 * runs after a send that ended (marked or not), to load the batch again.
 */

import { useEffect, useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'

const SEND_MESSAGES = Object.freeze({
  done: 'Sales entries sent to Tally.',
  failed: 'Tally could not take the sales entries.',
})

const NOTHING = Object.freeze([])

export default function useTallySendAndMark({ moduleName, companyName, buildMessage, markSent, onSettled }) {
  const [inFlight, setInFlight] = useState(NOTHING)
  const [unmarked, setUnmarked] = useState(NOTHING)
  const [marking, setMarking] = useState(false)
  // The invoice numbers of the running send - a ref, read by Tally's reply.
  const pendingRef = useRef(null)
  const latestRef = useRef({ markSent, onSettled })

  useEffect(() => {
    latestRef.current = { markSent, onSettled }
  })

  const mark = async (invoiceNumbers) => {
    setMarking(true)
    try {
      await latestRef.current.markSent(invoiceNumbers)
      setUnmarked((previous) => previous.filter((number) => !invoiceNumbers.includes(number)))
      return true
    } catch (failure) {
      setUnmarked((previous) => [...new Set([...previous, ...invoiceNumbers])])
      toast.error(`Tally took the entries, but they could not be marked as sent: ${failure.message}`, {
        description: 'Use "Mark as sent" - do not send them again.',
        duration: 10000,
      })
      return false
    } finally {
      setMarking(false)
    }
  }

  const finish = () => {
    pendingRef.current = null
    setInFlight(NOTHING)
    latestRef.current.onSettled?.()
  }

  const sync = useTallySync({
    moduleName,
    companyName,
    buildMessage,
    messages: SEND_MESSAGES,
    onSuccess: async () => {
      const numbers = pendingRef.current ?? []
      if (numbers.length > 0) await mark(numbers)
      finish()
    },
    onFailure: finish,
  })

  const send = async (items) => {
    if (pendingRef.current || marking) {
      toast.error('Sales entries are still being sent to Tally. Please wait for it to finish.')
      return false
    }
    if (items.length === 0) return false

    const numbers = items.map((item) => item.invoiceNo)
    pendingRef.current = numbers
    setInFlight(numbers)
    const started = await sync.start(items.map((item) => item.row))
    // Not started for want of a company or a session: useTallySync has said why.
    if (!started && pendingRef.current === numbers) {
      pendingRef.current = null
      setInFlight(NOTHING)
    }
    return started
  }

  const retryMark = async () => {
    if (unmarked.length === 0 || marking) return
    if (await mark(unmarked)) {
      toast.success('Entries marked as sent.')
      latestRef.current.onSettled?.()
    }
  }

  return { busy: sync.syncing || marking, marking, inFlight, unmarked, send, retryMark }
}
