/**
 * Send to Tally / Verified for the Voucher view - runTallySend and
 * runVoucherVerify (Voucher/tallySend) wired to the app's shared WebSocket
 * and the voucher update (PUT invoice/tally-vouchers/):
 *
 *   const tally = useVoucherTallySend(companyId)
 *
 *   sendingId        the document_id on its way, or null
 *   resultOf(id)     this session's last result for a voucher - { outcome, message } or null
 *   send(id, payload, updateBody, onReply)   Tally: the WebSocket, then the update -
 *                    onReply({ ok, message }) with Tally's answer the moment it comes
 *   verify(id, updateBody)          not Tally: the update alone
 *
 * The WebSocket is the app's one connection (useWebSocket) - no new one per
 * click. Only replies under TALLY_VOUCHER_MODULE are heard, and only the
 * one that says stop_loader is Tally's answer (the convention of every Tally
 * reply in the app); it is waited for up to REPLY_TIMEOUT_MS. A reply that
 * names another voucher (its document_id or document_no, when it carries
 * them) is not this one's answer; one arriving when no voucher is waiting, or
 * a second copy after the answer, is dropped.
 *
 * A voucher the update recorded is done (is_deleted), so the shared voucher
 * list for this company is read again - it leaves the list from the server's
 * answer, never by being removed here.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { QUERY } from '@/Constants/queryKeys'
import { useWebSocket } from '@/Hooks/useWebSocket'
import { invalidateQueries } from '@/Library/queryCache'
import { runTallySend, runVoucherVerify } from '@/Modules/SalesInvoice/Voucher/tallySend'
import { TALLY_VOUCHER_MODULE, updateTallyVoucher } from '@/Services/salesInvoiceService'

const text = (value) => (value === null || value === undefined ? '' : String(value).trim())

/** Whether a reply is about the voucher being sent - only identifiers it actually carries are compared. */
const isAbout = (reply, voucher) => {
  if (!voucher) return true
  if (text(reply.document_id) && text(reply.document_id) !== voucher.documentId) return false
  if (text(reply.document_no) && voucher.documentNo && text(reply.document_no) !== voucher.documentNo) return false
  return true
}

/** How long Tally is waited for once the message is out - as long as the other Tally imports wait. */
const REPLY_TIMEOUT_MS = 5 * 60 * 1000

const DONE = new Set(['sent', 'verified'])

export default function useVoucherTallySend(companyId) {
  const [sendingId, setSendingId] = useState(null)
  const [results, setResults] = useState({})
  // The answer being waited for: { settle(reply | null) }.
  const waiting = useRef(null)
  // The voucher it is for: { documentId, documentNo }.
  const sendingVoucher = useRef(null)

  const { send: sendMessage } = useWebSocket({
    module: TALLY_VOUCHER_MODULE,
    onMessage: (data) => {
      const reply = data?.res
      if (!reply || reply.return_module_name !== TALLY_VOUCHER_MODULE) return
      // Anything before stop_loader is Tally still working.
      if (reply.action_status !== 'stop_loader') return
      if (!isAbout(reply, sendingVoucher.current)) return
      waiting.current?.settle(reply)
    },
  })

  // Nothing of a send outlives the view.
  useEffect(
    () => () => {
      waiting.current?.settle(null)
    },
    [],
  )

  const expectReply = useCallback(() => {
    let settle
    const reply = new Promise((resolve) => {
      const timer = setTimeout(() => settle(null), REPLY_TIMEOUT_MS)
      settle = (value) => {
        clearTimeout(timer)
        if (waiting.current?.settle === settle) waiting.current = null
        resolve(value)
      }
    })
    waiting.current = { settle }
    return { reply, cancel: () => settle(null) }
  }, [])

  const run = useCallback(
    async (documentId, start) => {
      setSendingId(documentId)
      const result = await start()
      setSendingId(null)
      if (result.outcome !== 'busy') setResults((current) => ({ ...current, [`${companyId}:${documentId}`]: result }))
      if (DONE.has(result.outcome)) invalidateQueries(QUERY.TALLY_VOUCHERS, { whose: companyId, refetchActive: true })
      return result
    },
    [companyId],
  )

  const send = useCallback(
    (documentId, payload, updateBody, onReply) =>
      run(documentId, async () => {
        const voucher = { documentId: text(payload?.document_id ?? documentId), documentNo: text(payload?.data?.[0]?.document_no) }
        // A second press while one is on its way is turned away (busy) - it never takes the first one's place.
        if (sendingVoucher.current === null) sendingVoucher.current = voucher
        try {
          return await runTallySend({ documentId, payload, updateBody, expectReply, sendMessage, updateVoucher: updateTallyVoucher, onReply })
        } finally {
          if (sendingVoucher.current === voucher) sendingVoucher.current = null
        }
      }),
    [run, expectReply, sendMessage],
  )

  const verify = useCallback(
    (documentId, updateBody) => run(documentId, () => runVoucherVerify({ documentId, updateBody, updateVoucher: updateTallyVoucher })),
    [run],
  )

  const resultOf = useCallback((documentId) => results[`${companyId}:${documentId}`] ?? null, [results, companyId])

  return { sendingId, resultOf, send, verify }
}
