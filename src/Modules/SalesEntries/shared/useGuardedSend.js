/**
 * THE SEND BUTTON'S CHECKS, the same in every view:
 *
 *   const guard = useGuardedSend({ chosen, problemOf, toItem, tally })
 *   guard.send()           Send to Tally was pressed
 *   guard.confirming       > 0 while "send anyway?" is asked - that many ticked
 *                          entries have a party ledger that is not in Tally
 *   guard.proceed(), guard.cancel()
 *
 *   1. an entry that cannot go (problemOf(entry) says why) stops the send, and
 *      the first one is named
 *   2. a party ledger not in Tally is asked about: Tally will refuse it, and
 *      then nothing of the send is marked sent
 *   3. else every ticked entry goes, as toItem(entry) -> { invoiceNo, row }
 */

import { useState } from 'react'

import { toast } from '@/Library/toast'
import { plural } from '@/Modules/SalesEntries/shared/ledgerLists'

export default function useGuardedSend({ chosen, problemOf, toItem, tally }) {
  const [confirming, setConfirming] = useState(0)

  const proceed = () => {
    setConfirming(0)
    tally.send(chosen.map(toItem))
  }

  const send = () => {
    if (chosen.length === 0) return
    const blocked = chosen.filter((entry) => problemOf(entry))
    if (blocked.length > 0) {
      const [first] = blocked
      toast.error(`${plural(blocked.length, 'selected entry', 'selected entries')} cannot be sent yet.`, {
        description: `Invoice ${first.invoiceNo || '(no number)'}: ${problemOf(first)}`,
      })
      return
    }
    const missing = chosen.filter((entry) => entry.notInTally).length
    if (missing > 0) {
      setConfirming(missing)
      return
    }
    proceed()
  }

  return { send, confirming, proceed, cancel: () => setConfirming(0) }
}
