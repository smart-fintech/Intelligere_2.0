/**
 * A SYNC FROM TALLY - over the app's one WebSocket, the way Fetch from Tally and
 * Ledger Details' Sync Now do it. Payable Receivable and Ledger Export both use
 * it; each says what to send and what to call it:
 *
 *   const sync = useTallySync({
 *     moduleName,      // the name Tally goes by for it, sent and answered
 *     companyName,
 *     buildMessage,    // (companyName, ...args) => the message to send
 *     messages,        // { done, failed } when Tally's reply has no `msg`
 *     onSuccess,
 *     onFailure,       // optional - Tally refused, or the sync could not finish
 *   })
 *   sync.start(...args)
 *
 *   syncing      true from the click until Tally's stop_loader (or a failure)
 *
 * Tally answers under return_module_name `moduleName`, and `module` below means
 * only those replies reach this hook - no other Tally operation is touched.
 * Several replies can arrive; only action_status "stop_loader" ends the sync,
 * its `status` saying how it went and its `msg` what to show.
 *
 * A click while a sync is running is ignored. A connection lost mid-sync, or
 * no stop_loader within SYNC_TIMEOUT_MS, ends it as a failure. On success
 * `onSuccess` runs - the lists are read again then; on a failure, `onFailure`.
 */

import { useEffect, useRef, useState } from 'react'

import { useWebSocket } from '@/Hooks/useWebSocket'
import { getEmail } from '@/Library/secureStorage'
import { toast } from '@/Library/toast'

/** The longest a sync waits for Tally's stop_loader - the same allowance as Ledger and Product Sync. */
const SYNC_TIMEOUT_MS = 5 * 60 * 1000

/**
 * What one WebSocket message means for the sync:
 *
 *   null                     not the sync's end - another module's reply, or
 *                            one of the sync's progress messages
 *   { ok: false, message }   stop_loader with status "error"
 *   { ok: true, message }    stop_loader otherwise
 */
export const readSyncReply = (data, moduleName, messages) => {
  const reply = data?.res
  if (!reply || reply.return_module_name !== moduleName) return null
  if (reply.action_status !== 'stop_loader') return null
  return reply.status === 'error'
    ? { ok: false, message: reply.msg || messages.failed }
    : { ok: true, message: reply.msg || messages.done }
}

export default function useTallySync({ moduleName, companyName, buildMessage, messages, onSuccess, onFailure }) {
  const [syncing, setSyncing] = useState(false)
  // 'idle' | 'sending' | 'waiting' (for stop_loader). A ref: the socket
  // callback that reads it is registered once.
  const phaseRef = useRef('idle')
  const timerRef = useRef(null)
  const latestRef = useRef({ messages, onSuccess, onFailure })

  useEffect(() => {
    latestRef.current = { messages, onSuccess, onFailure }
  })

  const end = () => {
    phaseRef.current = 'idle'
    clearTimeout(timerRef.current)
    timerRef.current = null
    setSyncing(false)
  }

  const fail = (message, error) => {
    console.error(`[Tally Sync: ${moduleName}] WebSocket error:`, error ?? message)
    end()
    toast.error(message)
    latestRef.current.onFailure?.()
  }

  const { send, status } = useWebSocket({
    module: moduleName,
    onMessage: (data) => {
      // Not a sync started here (or one already finished): ignore it.
      if (phaseRef.current !== 'waiting' && phaseRef.current !== 'sending') return
      const result = readSyncReply(data, moduleName, latestRef.current.messages)
      if (!result) return

      end()
      if (!result.ok) {
        toast.error(result.message)
        latestRef.current.onFailure?.()
        return
      }
      toast.success(result.message)
      latestRef.current.onSuccess?.()
    },
  })

  // The connection dropped while Tally was working: its reply is lost.
  useEffect(() => {
    if (status === 'closed' && phaseRef.current === 'waiting') {
      fail('The live server connection was lost during the Tally sync. Please try again.')
    }
    // fail is a plain function recreated each render; only the status should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Nothing of a sync may outlive the screen.
  useEffect(
    () => () => {
      phaseRef.current = 'idle'
      clearTimeout(timerRef.current)
    },
    [],
  )

  /** Starts a sync - false when one is already running, or the company or user is missing. */
  const start = async (...args) => {
    if (phaseRef.current !== 'idle') return false
    const name = companyName?.trim()
    if (!name) {
      toast.error('Please select an active company before syncing from Tally.')
      return false
    }
    if (!getEmail()) {
      toast.error('Your session has no email. Please sign in again before syncing from Tally.')
      return false
    }

    phaseRef.current = 'sending'
    setSyncing(true)

    const delivered = await send(buildMessage(name, ...args))

    // The reply may already have arrived, or the screen gone away.
    if (phaseRef.current !== 'sending') return true
    if (!delivered) {
      fail('Could not reach the live server. Please try again.')
      return false
    }

    phaseRef.current = 'waiting'
    timerRef.current = setTimeout(() => {
      if (phaseRef.current === 'waiting') fail('Tally did not finish the sync in time. Please try again.')
    }, SYNC_TIMEOUT_MS)
    return true
  }

  return { syncing, start }
}
