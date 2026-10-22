/**
 * SEND TO TALLY / VERIFIED - the order things happen in, and nothing else.
 * The calls themselves are handed in, so the sequence can be followed (and
 * checked) without a server or a socket.
 *
 * TALLY - runTallySend({ documentId, payload, updateBody, expectReply, sendMessage, updateVoucher })
 *
 *   1. expectReply()             starts listening for Tally's answer before
 *                                anything is sent, so a quick answer is not
 *                                missed -> { reply: Promise, cancel() }
 *   2. sendMessage(message)      the WebSocket message (true once delivered)
 *   3. the reply                 Tally's stop_loader answer - only status
 *                                "success" goes on; anything else stops here
 *                                and the update is NOT called
 *   4. updateVoucher(updateBody) PUT invoice/tally-vouchers/ - recorded only
 *                                once Tally has the voucher
 *
 * NOT TALLY - runVoucherVerify({ documentId, updateBody, updateVoucher })
 *   the update alone - no WebSocket.
 *
 * -> { outcome, message }, outcome one of
 *   sent            Tally confirmed it and the update was recorded
 *   verified        (not Tally) the update was recorded
 *   socket-failed   the message could not be delivered - nothing else was done
 *   tally-failed    Tally answered with an error - the update was not called
 *   no-reply        Tally never answered - the update was not called
 *   update-failed   the update was refused (after Tally confirmed it, for a
 *                   Tally company - a PARTIAL failure: Tally has the voucher,
 *                   and nothing is sent to Tally again automatically)
 *   busy            another voucher is being sent - this one was not started
 *
 * ONE AT A TIME, app-wide: Tally's answer carries no reference back to the
 * voucher it is about, so a second voucher in flight could take the first
 * one's answer. The lock is this module's own (not a component's), so
 * neither a double click nor the other module's Voucher view can start a
 * second.
 */

import { buildVoucherSocketMessage } from '@/Services/salesInvoiceService'

let sending = null

/** The document_id being sent right now - null when none. */
export const sendingVoucherId = () => sending

/** Whether an API reply says the request failed - an error status, or success: false. */
const refused = (reply) =>
  Boolean(reply) &&
  typeof reply === 'object' &&
  (reply.success === false || ['error', 'failed', 'failure'].includes(String(reply.status ?? '').toLowerCase()))

const messageOf = (value, fallback) => (value && typeof value === 'object' && typeof value.msg === 'string' && value.msg.trim() ? value.msg.trim() : fallback)

/** The update, its answer read: null when it was recorded, else the failure. */
const update = async (updateVoucher, updateBody, partial) => {
  const lead = partial ? 'Tally has the voucher, but it could not be marked done here' : 'The voucher could not be verified'
  try {
    const reply = await updateVoucher(updateBody)
    if (refused(reply)) return { failure: { outcome: 'update-failed', message: `${lead}: ${messageOf(reply, 'the server refused it')}` } }
    return { reply }
  } catch (failure) {
    return { failure: { outcome: 'update-failed', message: `${lead}: ${failure?.message || 'the server did not answer'}` } }
  }
}

const once = async (documentId, run) => {
  if (sending !== null) return { outcome: 'busy', message: 'Another voucher is being sent. Please wait for it to finish.' }
  sending = String(documentId)
  try {
    return await run()
  } finally {
    sending = null
  }
}

export const runTallySend = ({ documentId, payload, updateBody, expectReply, sendMessage, updateVoucher }) =>
  once(documentId, async () => {
    const listening = expectReply()
    const delivered = await sendMessage(buildVoucherSocketMessage(payload))
    if (!delivered) {
      listening.cancel()
      return { outcome: 'socket-failed', message: 'Could not reach Tally - the live connection is down. Nothing was sent.' }
    }

    const reply = await listening.reply
    if (reply === null) return { outcome: 'no-reply', message: 'Tally did not answer in time. Check Tally before sending the voucher again.' }
    if (String(reply.status ?? '').toLowerCase() !== 'success') return { outcome: 'tally-failed', message: messageOf(reply, 'Tally could not create the voucher.') }

    const done = await update(updateVoucher, updateBody, true)
    if (done.failure) return done.failure
    return { outcome: 'sent', message: messageOf(done.reply, messageOf(reply, 'Voucher sent to Tally.')) }
  })

export const runVoucherVerify = ({ documentId, updateBody, updateVoucher }) =>
  once(documentId, async () => {
    const done = await update(updateVoucher, updateBody, false)
    if (done.failure) return done.failure
    return { outcome: 'verified', message: messageOf(done.reply, 'Voucher verified.') }
  })
