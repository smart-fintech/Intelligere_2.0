/**
 * MISSING PARTY LEDGERS ARE CREATED IN TALLY ON THEIR OWN - as the old screen
 * did for B2B with inventory (the user's choice, 2026-11-04):
 *
 *   const auto = useAutoPartyLedgers({ companyName, enabled, onDone })
 *   auto.createFor(rows)   with each batch that arrives (useEntryBatches' onLoaded)
 *   auto.creating          Set of the (lower-case) names being created now
 *   auto.retry(rows)       try the ones still missing again - the user asked
 *
 * One bulk_ledger_create message (Services/Ledger/ledgerService) carries every party
 * of the batch that is "Not in tally", under Sundry Debtors with its GSTIN
 * and state. The agent creates them, reads the ledgers back into the
 * backend, and answers with a stop_loader; `onDone` then loads the batch
 * again, which finds them.
 *
 * A name is tried ONCE per screen: the reload that follows finds it, or
 * shows it still missing (with Create and Retry) - never another automatic
 * attempt, so a ledger Tally refuses cannot loop.
 */

import { useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import useTallyExchange from '@/Modules/GstCompare/useTallyExchange'
import { text } from '@/Modules/SalesEntries/shared/ledgerLists'
import { BULK_LEDGER_CREATE_MODULE, buildBulkLedgerMessage } from '@/Services/Ledger/ledgerService'

const NOT_IN_TALLY = 'not in tally'
const NONE = new Set()

/** The ledger as the bulk create reads it - the old screen's fields. */
const toLedger = (raw) => ({
  ledeger_name: text(raw.ledgername),
  ledeger_gstin: text(raw.gstno),
  ledeger_state: text(raw.state),
  ledeger_address: '',
  ledeger_email: '',
  ledeger_phone: '',
  ledeger_website: '',
  ledeger_group: 'Sundry Debtors',
  group_name: 'Sundry Debtors',
  gst_rate: '',
})

/** The batch's parties that are not in Tally, each once. */
const missingParties = (rows) => {
  const seen = new Map()
  rows.forEach((raw) => {
    const name = text(raw?.ledgername)
    if (name && text(raw?.tallyledger).toLowerCase() === NOT_IN_TALLY && !seen.has(name.toLowerCase())) {
      seen.set(name.toLowerCase(), raw)
    }
  })
  return [...seen]
}

export default function useAutoPartyLedgers({ companyName, enabled, onDone }) {
  const triedRef = useRef(new Set())
  const [creating, setCreating] = useState(NONE)

  const exchange = useTallyExchange({
    module: BULK_LEDGER_CREATE_MODULE,
    onReply: (reply) => {
      setCreating(NONE)
      if (reply.status === 'success') toast.success(reply.msg || 'Missing party ledgers created in Tally.')
      else toast.error(reply.msg || 'Tally could not create the missing party ledgers.')
      onDone()
    },
  })

  const create = async (parties) => {
    if (parties.length === 0 || exchange.busy || !text(companyName)) return
    parties.forEach(([key]) => triedRef.current.add(key))
    setCreating(new Set(parties.map(([key]) => key)))
    toast.info(`Creating ${parties.length} missing party ledger${parties.length === 1 ? '' : 's'} in Tally...`)
    const started = await exchange.start(buildBulkLedgerMessage(companyName, parties.map(([, raw]) => toLedger(raw))))
    if (!started) setCreating(NONE)
  }

  return {
    busy: exchange.busy,
    creating,
    createFor: (rows) => {
      if (!enabled) return
      create(missingParties(rows).filter(([key]) => !triedRef.current.has(key)))
    },
    retry: (rows) => create(missingParties(rows)),
  }
}
