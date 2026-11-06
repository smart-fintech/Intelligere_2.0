import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Modal } from '@/Components/Common/Modal'
import LedgerForm from '@/Modules/Dashboard/Components/LedgerForm'
import { fetchBankOptions, selectBankNames } from '@/Store/Slices/bankSlice'
import { fetchLedgerGroups, fetchLedgers, selectLedgerGroups } from '@/Store/Slices/ledgerSlice'
import { selectIsTallyErp } from '@/Store/Slices/profileSlice'

/**
 * CREATE the party ledger of an entry that is "Not in Tally" - the Ledger
 * Details form (LedgerForm) in a dialog, as Sales Invoice's GST ledger check
 * does, filled in from the entry: its name, GSTIN, state and address, under
 * Sundry Debtors. A Tally user's ledger goes over the WebSocket, as on the
 * Ledger page.
 *
 *   entry      the entry whose party ledger is made, or null (closed)
 *   group      optional - the ledger group it starts under (Sundry Debtors; B2B / CNDN's
 *              suppliers pass Sundry Creditors)
 *   description  optional - the dialog's line under the title (default: "For invoice <no>")
 *   onCreated  after the save - the screen loads the batch again, and the
 *              backend then finds the ledger and drops "Not in Tally"
 */
export default function CreatePartyLedgerModal({ entry, companyId, companyName, onClose, onCreated, group = 'Sundry Debtors', description }) {
  const dispatch = useDispatch()
  const groups = useSelector(selectLedgerGroups)
  const bankNames = useSelector(selectBankNames)
  const isTally = useSelector(selectIsTallyErp)

  // What the form's dropdowns are made of - no-ops when already loaded.
  useEffect(() => {
    if (!entry) return
    dispatch(fetchLedgerGroups())
    dispatch(fetchBankOptions())
  }, [dispatch, entry])

  const refreshLedgers = () => dispatch(fetchLedgers({ companyId, force: true }))

  return (
    <Modal
      open={Boolean(entry)}
      onOpenChange={(next) => (next ? null : onClose())}
      title="Create party ledger"
      description={entry ? (description ?? `For invoice ${entry.invoiceNo}`) : undefined}
      size="lg"
    >
      {entry ? (
        <LedgerForm
          key={entry.key}
          ledger={null}
          defaults={{
            ledeger_name: entry.partyLedger,
            ledeger_gstin: entry.gstin,
            ledeger_state: entry.state,
            ledeger_address: entry.address,
            ledeger_group_name: group,
          }}
          companyId={companyId}
          companyName={companyName}
          groups={groups}
          bankNames={bankNames}
          onSaved={() => {
            refreshLedgers()
            onCreated()
          }}
          onCancel={onClose}
          isTally={isTally}
          onRefresh={refreshLedgers}
          framed={false}
        />
      ) : null}
    </Modal>
  )
}
