import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Field, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { checkOpeningBalance } from '@/Modules/PayableReceivable/payableReceivable'
import { saveOpeningBalance } from '@/Services/payableReceivableService'
import { fetchLedgers, selectLedgerStatus, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'
import { toInputDate } from '@/Utils/date'

/**
 * ADD OPENING BALANCE - POST tally/Save_opening_balance/.
 *
 * The ledgers offered are the company's (the shared ledger store, loaded here
 * if no screen has yet) with the parties on screen, so a list that came from
 * Tally can always be chosen from even if the ledgers could not be read.
 *
 *   companyId      the active company - sent as company_id
 *   partyNames     the parties of the list on screen
 *   initialLedger  chosen to begin with, when opened from a party's row
 *   onSaved        reads the list again and closes it
 *
 * Mounted only while it is wanted, so every opening starts clean. Stays open
 * on a failure, for another try.
 */
export default function OpeningBalanceModal({ companyId, partyNames, initialLedger = '', onClose, onSaved }) {
  const dispatch = useDispatch()
  const ledgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)
  const ledgerStatus = useSelector(selectLedgerStatus)

  const [ledgerName, setLedgerName] = useState(initialLedger)
  const [openingBalance, setOpeningBalance] = useState('')
  const [date, setDate] = useState(() => toInputDate(new Date()))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  const options = useMemo(() => {
    const own = ledgersFor === companyId ? ledgers.map((ledger) => ledger.ledeger_name) : []
    return [...new Set([...own, ...partyNames].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }))
  }, [ledgers, ledgersFor, companyId, partyNames])

  const save = async () => {
    const found = checkOpeningBalance({ ledgerName, openingBalance, date })
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      const reply = await saveOpeningBalance({
        company_id: companyId,
        ledger_name: ledgerName,
        opening_balance: Number(openingBalance),
        date,
      })
      toast.success(reply?.msg || 'Opening balance saved.')
      await onSaved()
    } catch (failure) {
      toast.error(failure.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => !saving && !next && onClose()}
      title="Add Opening Balance"
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        <SelectField
          id="pr-opening-ledger"
          label="Ledger"
          required
          searchable
          searchPlaceholder="Search ledger"
          className="sm:col-span-2"
          placeholder={ledgerStatus === 'loading' ? 'Loading ledgers...' : 'Select ledger'}
          options={options}
          value={ledgerName}
          error={errors.ledgerName}
          disabled={saving}
          onValueChange={setLedgerName}
        />
        <Field
          id="pr-opening-amount"
          label="Opening Balance"
          required
          type="number"
          step="0.01"
          placeholder="Enter opening balance"
          value={openingBalance}
          error={errors.openingBalance}
          disabled={saving}
          onChange={(event) => setOpeningBalance(event.target.value)}
        />
        <Field
          id="pr-opening-date"
          label="Date"
          required
          type="date"
          value={date}
          max={toInputDate(new Date())}
          error={errors.date}
          disabled={saving}
          onChange={(event) => setDate(event.target.value)}
        />
      </FormGrid>
    </Modal>
  )
}
