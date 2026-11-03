/**
 * ONE REQUEST TO TALLY AND ITS ONE ANSWER, over the app's shared WebSocket:
 *
 *   const fetch = useTallyExchange({ module, onReply })
 *   fetch.start(message)   false when one is already running or it could not be sent
 *
 *   busy       true from the send until Tally's stop_loader (or a failure)
 *
 * Only action_status "stop_loader" under this module's return_module_name ends
 * it, and onReply gets that reply: its `status` says how it went and its `msg`
 * what to show. A connection lost on the way, or no answer within the time
 * allowed, ends it with a toast and no onReply.
 */

import { useEffect, useRef, useState } from 'react'

import { useWebSocket } from '@/Hooks/useWebSocket'
import { toast } from '@/Library/toast'

/** The same allowance as the other Tally fetches. */
const TIMEOUT_MS = 5 * 60 * 1000

export default function useTallyExchange({ module, onReply }) {
  const [busy, setBusy] = useState(false)
  // 'idle' | 'sending' | 'waiting'. A ref: the socket callback reads the latest at once.
  const phaseRef = useRef('idle')
  const timerRef = useRef(null)

  const end = () => {
    phaseRef.current = 'idle'
    clearTimeout(timerRef.current)
    timerRef.current = null
    setBusy(false)
  }

  const { send, status } = useWebSocket({
    module,
    onMessage: (data) => {
      if (phaseRef.current === 'idle') return
      const reply = data?.res
      if (reply?.return_module_name !== module || reply.action_status !== 'stop_loader') return
      end()
      onReply(reply)
    },
  })

  useEffect(() => {
    if (status === 'closed' && phaseRef.current === 'waiting') {
      phaseRef.current = 'idle'
      clearTimeout(timerRef.current)
      setBusy(false)
      toast.error('The live server connection was lost while talking to Tally. Please try again.')
    }
  }, [status])

  // Nothing of an exchange may outlive the screen.
  useEffect(
    () => () => {
      phaseRef.current = 'idle'
      clearTimeout(timerRef.current)
    },
    [],
  )

  const start = async (message) => {
    if (phaseRef.current !== 'idle') return false
    phaseRef.current = 'sending'
    setBusy(true)

    const delivered = await send(message)

    // The reply may already have arrived, or the screen gone away.
    if (phaseRef.current !== 'sending') return true
    if (!delivered) {
      end()
      toast.error('Could not reach the live server. Please try again.')
      return false
    }

    phaseRef.current = 'waiting'
    timerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'waiting') return
      end()
      toast.error('Tally did not answer in time. Please try again.')
    }, TIMEOUT_MS)
    return true
  }

  return { busy, start }
}
