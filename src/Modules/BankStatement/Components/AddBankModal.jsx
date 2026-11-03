import { useDispatch, useSelector } from 'react-redux'

import { Modal } from '@/Components/Common/Modal'
import BankForm from '@/Modules/Dashboard/Components/BankForm'
import { fetchBanks } from '@/Store/Slices/bankSlice'
import { fetchLedgers, selectLedgerError, selectLedgerStatus, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'

/**
 * Add New Bank, without leaving the statement - the Bank Details form itself,
 * in a dialog. A saved account reloads the shared bank list, so it is in the
 * Bank dropdown straight away.
 */
export default function AddBankModal({ open, onOpenChange, companyId, companyName }) {
  const dispatch = useDispatch()
  const allLedgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)
  const ledgerError = useSelector(selectLedgerError)
  const ledgersReady = ledgerStatus === 'succeeded' && ledgersFor === companyId

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" title="Add New Bank">
      <BankForm
        bank={null}
        companyId={companyId}
        companyName={companyName}
        ledgers={ledgersReady ? allLedgers : []}
        ledgersStatus={ledgersReady || ledgerStatus === 'failed' ? ledgerStatus : 'loading'}
        ledgersError={ledgerStatus === 'failed' ? ledgerError : null}
        onRetryLedgers={() => dispatch(fetchLedgers({ companyId, force: true }))}
        onSaved={() => {
          dispatch(fetchBanks({ companyId, force: true }))
          onOpenChange(false)
        }}
        onCancel={() => onOpenChange(false)}
      />
    </Modal>
  )
}
