/**
 * SEND TO TALLY - the module's one way of putting vouchers in Tally, for a
 * Tally user: Voucher, Upload Excel and History's Resend all go through it.
 * It is useTallySync's send-and-wait, as Amount Distribution's Send to Tally:
 *
 *   const tally = useJvTallySend()               // once, by the screen
 *   tally.send(vouchers, { onSent, onFailed })   vouchers as jv-vouchers/ takes them
 *   tally.sending                                true until Tally answers
 *
 * One for the whole screen, so two sends never wait on the same reply: a send
 * while one is running is refused. `onSent` or `onFailed` runs once - on
 * Tally's stop_loader, or when the send could not be made or finished.
 * Tally's own message is shown either way (useTallySync). Resolves to whether
 * the vouchers reached the socket.
 */

import { useRef } from 'react'

import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { toast } from '@/Library/toast'
import { toTallyJournalRow } from '@/Modules/JournalVoucher/journalVoucher'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'
import { TALLY_JV_MODULE, buildJvTallyMessage } from '@/Services/journalVoucherService'

const SEND_MESSAGES = Object.freeze({
  done: 'Voucher sent to Tally.',
  failed: 'Tally could not take the voucher.',
})

export default function useJvTallySend() {
  const { activeCompany } = useActiveCompany()
  const pending = useRef(null) // the running send's { onSent, onFailed }

  const settle = (outcome) => {
    const callbacks = pending.current
    pending.current = null
    callbacks?.[outcome]?.()
  }

  const sync = useTallySync({
    moduleName: TALLY_JV_MODULE,
    companyName: activeCompany?.comp_name,
    buildMessage: (companyName, vouchers) =>
      buildJvTallyMessage(companyName, vouchers.map((voucher) => toTallyJournalRow(activeCompany, voucher))),
    messages: SEND_MESSAGES,
    onSuccess: () => settle('onSent'),
    onFailure: () => settle('onFailed'),
  })

  const send = async (vouchers, callbacks = {}) => {
    if (pending.current) {
      toast.error('A voucher is still being sent to Tally. Please wait for it to finish.')
      callbacks.onFailed?.()
      return false
    }
    pending.current = callbacks
    const started = await sync.start(vouchers)
    // Not started for want of a company or a session: useTallySync has said why.
    if (!started) settle('onFailed')
    return started
  }

  return { sending: sync.syncing, send }
}
