/**
 * FETCHING DOCUMENTS FROM TALLY - over the app's one WebSocket, the way
 * Ledger Details' Sync Now does it:
 *
 *   const tallyFetch = useTallyInvoiceFetch({ companyName, onSuccess })
 *   tallyFetch.start({ startYear, startMonth, endYear, endMonth, voucherTypes })
 *
 *   fetching     true from the click until Tally's stop_loader (or a failure)
 *   connection   the socket's 'closed' | 'connecting' | 'open'
 *
 * Sent as { payload: { module_name: "tally_invoice_fetch", company_name, data } }
 * (buildTallyInvoiceFetchMessage); Tally answers under
 * return_module_name "tally_invoice_fetch", and `module` below means only
 * those replies reach this hook - no other Tally operation is touched. Several
 * replies can arrive; only action_status "stop_loader" ends the fetch, its
 * `status` saying how it went and its `msg` what to show.
 *
 * A click while a fetch is running is ignored. A connection lost mid-fetch,
 * or no stop_loader within FETCH_TIMEOUT_MS, ends it as a failure. On success
 * `onSuccess` runs - the history is read again then.
 */

import { useEffect, useRef, useState } from 'react'

import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'
import { markProductsChanged } from '@/Services/productCache'
import { TALLY_INVOICE_FETCH_MODULE, buildTallyInvoiceFetchMessage } from '@/Services/salesInvoiceService'

/** The longest a fetch waits for Tally's stop_loader - the same allowance as Ledger and Product Sync. */
const FETCH_TIMEOUT_MS = 5 * 60 * 1000

/**
 * What one WebSocket message means for the fetch:
 *
 *   null                     not the fetch's end - another module's reply,
 *                            or one of the fetch's progress messages
 *   { ok: false, message }   stop_loader with status "error"
 *   { ok: true, message }    stop_loader otherwise
 */
export const readFetchReply = (data) => {
  const reply = data?.res
  if (!reply || reply.return_module_name !== TALLY_INVOICE_FETCH_MODULE) return null
  if (reply.action_status !== 'stop_loader') return null
  return reply.status === 'error'
    ? { ok: false, message: reply.msg || 'Tally could not fetch the documents.' }
    : { ok: true, message: reply.msg || 'Documents fetched from Tally.' }
}

export default function useTallyInvoiceFetch({ companyName, onSuccess }) {
  const [fetching, setFetching] = useState(false)
  // 'idle' | 'sending' | 'waiting' (for stop_loader). A ref: the socket
  // callback that reads it is registered once.
  const phaseRef = useRef('idle')
  const timerRef = useRef(null)
  const onSuccessRef = useRef(onSuccess)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  const end = () => {
    phaseRef.current = 'idle'
    clearTimeout(timerRef.current)
    timerRef.current = null
    setFetching(false)
  }

  const fail = (message, error) => {
    console.error('[Tally Invoice Fetch] WebSocket error:', error ?? message)
    end()
    toast.error(message)
  }

  const { send, status } = useWebSocket({
    module: TALLY_INVOICE_FETCH_MODULE,
    onMessage: (data) => {
      // Not a fetch started here (or one already finished): ignore it.
      if (phaseRef.current !== 'waiting' && phaseRef.current !== 'sending') return
      const result = readFetchReply(data)
      if (!result) return

      end()
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      // Documents brought over from Tally can move stock.
      markProductsChanged()
      onSuccessRef.current?.()
    },
  })

  // The connection dropped while Tally was working: its reply is lost.
  useEffect(() => {
    if (status === 'closed' && phaseRef.current === 'waiting') {
      fail('The live server connection was lost during the Tally fetch. Please try again.')
    }
    // fail is a plain function recreated each render; only the status should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Nothing of a fetch may outlive the screen.
  useEffect(
    () => () => {
      phaseRef.current = 'idle'
      clearTimeout(timerRef.current)
    },
    [],
  )

  /** Starts a fetch - false when one is already running or there is no company. */
  const start = async (range) => {
    if (phaseRef.current !== 'idle') return false
    const name = companyName?.trim()
    if (!name) {
      toast.error('Please select an active company before fetching from Tally.')
      return false
    }

    phaseRef.current = 'sending'
    setFetching(true)

    const delivered = await send(buildTallyInvoiceFetchMessage(name, range))

    // The reply may already have arrived, or the screen gone away.
    if (phaseRef.current !== 'sending') return true
    if (!delivered) {
      fail('Could not reach the live server. Please try again.')
      return false
    }

    phaseRef.current = 'waiting'
    timerRef.current = setTimeout(() => {
      if (phaseRef.current === 'waiting') fail('Tally did not finish the fetch in time. Please try again.')
    }, FETCH_TIMEOUT_MS)
    return true
  }

  return { fetching, connection: status, start }
}
