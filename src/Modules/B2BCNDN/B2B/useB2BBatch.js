/**
 * THE B2B BATCH ON SCREEN - b2b_cndn_data/ asked with no file:
 *
 *   const batch = useB2BBatch(companyId)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed' - 'idle' until the first
 *             upload; 'loading' keeps the last batch on screen, so a reload does
 *             not empty the table
 *   reply     the API's answer as it came (readB2BBatch reads it), or null
 *   error
 *   reload()          asks again - the NEXT batch once entries were marked sent
 *   show(reply)       an answer already in hand: the upload's, which is the first batch
 *
 * The backend's batch is the first 100 entries not yet sent, so there is no
 * index to step: entries leave it as they are marked sent, and asking again
 * fills it up from the ones after. Only the latest request is listened to.
 *
 * NOTHING IS ASKED WHEN THE VIEW OPENS (the user's choice): the screen starts
 * on Get Entries, and the first batch is the upload's own answer (show). The
 * API is asked again only after that - next batch, refresh, after a send.
 */

import { useEffect, useRef, useState } from 'react'

import { getB2BBatch } from '@/Services/Accounting/b2bCndnService'

export default function useB2BBatch(companyId) {
  const [reply, setReply] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const requestRef = useRef(0)

  /** Asks for the batch; only the latest answer sets state. */
  const request = () => {
    const ticket = ++requestRef.current
    return getB2BBatch(companyId).then(
      (next) => {
        if (ticket !== requestRef.current) return
        setReply(next)
        setStatus('ready')
      },
      (failure) => {
        if (ticket !== requestRef.current) return
        setError(failure.message || 'The B2B entries could not be loaded.')
        setStatus('failed')
      },
    )
  }

  const reload = () => {
    setStatus('loading')
    setError(null)
    return request()
  }

  // An answer still on its way when the view goes is not wanted.
  useEffect(() => () => void (requestRef.current += 1), [])

  return {
    status,
    error,
    reply,
    reload,
    show: (next) => {
      requestRef.current += 1
      setReply(next)
      setStatus('ready')
      setError(null)
    },
  }
}
