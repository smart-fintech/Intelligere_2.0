import { useEffect, useRef, useState } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import {
  acknowledgeAiInvoiceProgress,
  getAiInvoiceProgress,
  readAiProgress,
  startAiInvoiceProcessing,
} from '@/Services/aiInvoiceService'

/**
 * AI VOUCHER'S UPLOAD AND ITS PROGRESS (Services/aiInvoiceService):
 *
 *   const ai = useAiVoucherProcessing({ companyName, companyId, documentType, active })
 *
 *   ai.phase      'checking'    the first read of the company's latest upload
 *                 'idle'        nothing to show - the files can be chosen and sent
 *                 'uploading'   the files are on their way
 *                 'processing'  the backend is reading them - as of the last read
 *                               (null `progress` right after the upload: not read yet)
 *                 'finished'    nothing pending or processing - waits for OK
 *   ai.progress   readAiProgress(...) of the last reply, or null
 *   ai.sent       how many files the last upload sent
 *   ai.refresh()       reads the progress again - the Refresh button
 *   ai.refreshing      a read is on its way (Refresh is disabled meanwhile)
 *   ai.upload(files)   -> true once the backend has STARTED the processing
 *   ai.acknowledge()   OK - { company_name, voucher: true }, once
 *   ai.acknowledging
 *
 * NO POLLING. The progress is read only when the AI Voucher view comes on
 * screen (`active` turning true - opened, or come back to) and when Refresh is
 * pressed; never after an upload by itself, never because processing is still
 * going. One read at a time; an answer for a company no longer shown is dropped.
 */
export function useAiVoucherProcessing({ companyName, companyId, documentType, active }) {
  const [phase, setPhase] = useState('checking')
  const [progress, setProgress] = useState(null)
  const [sent, setSent] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  // A visit - the view coming on screen, or another company - is a read
  // (the effect below sends it). Another company: nothing of the last one stays.
  const [shownFor, setShownFor] = useState(companyName)
  const [visible, setVisible] = useState(false)
  if (shownFor !== companyName || visible !== active) {
    if (shownFor !== companyName) {
      setProgress(null)
      setPhase('checking')
    }
    setShownFor(companyName)
    setVisible(active)
    if (active) setRefreshing(true)
  }
  const companyRef = useRef(companyName)
  const reading = useRef(null)
  const uploadBusy = useRef(false)
  const acknowledgeBusy = useRef(false)

  /** The answer of a read, for the company it was asked for (dropped if another is shown now). */
  const show = (asked, reply) => {
    if (companyRef.current !== asked) return
    if (reply.kind !== 'progress') {
      // {} - no upload, or already acknowledged: back to choosing files, nothing claimed.
      if (reply.kind === 'error') toast.error(reply.message)
      setProgress(null)
      setPhase('idle')
      return
    }
    setProgress(reply)
    setPhase(reply.finished ? 'finished' : 'processing')
    // The vouchers it made are in the company's list now.
    if (reply.finished && reply.success > 0) invalidateQueries(QUERY.TALLY_VOUCHERS, { whose: companyId, refetchActive: true })
  }
  const fail = (asked, failure) => {
    if (companyRef.current !== asked) return
    toast.error(failure.message || 'The progress could not be refreshed.')
    setPhase((current) => (current === 'checking' ? 'idle' : current))
  }

  /** Reads the progress - one read at a time; its caller has set `refreshing`. */
  const read = () => {
    const asked = companyName
    if (reading.current === asked) return
    reading.current = asked
    getAiInvoiceProgress(asked)
      .then((reply) => show(asked, readAiProgress(reply)), (failure) => fail(asked, failure))
      .finally(() => {
        if (reading.current === asked) reading.current = null
        setRefreshing(false)
      })
  }

  // Once per visit: the view opened or come back to (or another company).
  useEffect(() => {
    companyRef.current = companyName
    if (active) read()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a visit, not every render
  }, [active, companyName])

  const refresh = () => {
    if (reading.current === companyName || phase === 'uploading' || acknowledging) return
    setRefreshing(true)
    read()
  }

  const upload = async (files) => {
    if (uploadBusy.current || files.length === 0 || phase !== 'idle') return false
    uploadBusy.current = true
    setPhase('uploading')
    try {
      const reply = await startAiInvoiceProcessing({ companyName, documentType, files })
      // Started only when the backend says so - the documented reply names the upload.
      if (!reply?.upload_id) throw new Error(reply?.msg || 'The processing could not be started.')
      toast.success(reply.msg || 'Processing started in background')
      setProgress(null)
      setSent(files.length)
      setPhase('processing')
      return true
    } catch (failure) {
      toast.error(failure.message || 'The files could not be sent for processing.')
      setPhase('idle')
      return false
    } finally {
      uploadBusy.current = false
    }
  }

  const acknowledge = async () => {
    if (acknowledgeBusy.current || phase !== 'finished') return
    acknowledgeBusy.current = true
    setAcknowledging(true)
    try {
      await acknowledgeAiInvoiceProgress(companyName)
      setProgress(null)
      setPhase('idle')
    } catch (failure) {
      toast.error(failure.message || 'The upload could not be marked as seen.')
    } finally {
      acknowledgeBusy.current = false
      setAcknowledging(false)
    }
  }

  return { phase, progress, sent, refresh, refreshing, upload, acknowledge, acknowledging }
}

export default useAiVoucherProcessing
