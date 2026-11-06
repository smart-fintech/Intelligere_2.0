import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Field, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { checkBankEntry } from '@/Modules/PayableReceivable/LedgerExport/ledgerExport'
import { saveBankEntry, updateErpEntry } from '@/Services/Accounting/ledgerExportService'
import { fetchBanks, selectBankStatus, selectBanks, selectBanksCompanyId } from '@/Store/Slices/bankSlice'
import { fetchLedgers, selectLedgers, selectLedgersCompanyId } from '@/Store/Slices/ledgerSlice'
import { toInputDate } from '@/Utils/date'

/**
 * The two windows of the ERP ledger list. Mounted only while wanted, so each
 * opening starts clean; each stays open on a failure, for another try, and
 * `onSaved` reads the list again and closes it.
 */

function ModalFooter({ saving, onClose, onSave, label }) {
  return (
    <>
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
        Cancel
      </Button>
      <Button type="button" variant="secondary" loading={saving} onClick={onSave}>
        {label}
      </Button>
    </>
  )
}

/**
 * EDIT AN ENTRY - moves it to another ledger: PUT tally/ERP_ledger_export/. As
 * on the old screen only the ledger can change; the rest is shown, and the row
 * goes back whole.
 *
 *   ledgerName, row    where it is now, as the list has it
 *   ledgerNames        the ledgers of the list, offered with the company's own
 */
export function EditEntryModal({ companyId, ledgerName, row, ledgerNames, onClose, onSaved }) {
  const dispatch = useDispatch()
  const ledgers = useSelector(selectLedgers)
  const ledgersFor = useSelector(selectLedgersCompanyId)

  const [target, setTarget] = useState(ledgerName)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dispatch(fetchLedgers({ companyId }))
  }, [dispatch, companyId])

  const options = useMemo(() => {
    const own = ledgersFor === companyId ? ledgers.map((ledger) => ledger.ledeger_name) : []
    return [...new Set([...own, ...ledgerNames].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }))
  }, [ledgers, ledgersFor, companyId, ledgerNames])

  const save = async () => {
    if (!target) {
      setError('Select the ledger')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const reply = await updateErpEntry({
        id: row.id,
        position: row.position || 0,
        from_ledger: ledgerName,
        to_ledger: { [target]: [row] },
        module_name: row.module_name || '',
      })
      toast.success(reply?.msg || 'Ledger entry updated.')
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
      title="Edit Ledger Entry"
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      footer={<ModalFooter saving={saving} onClose={onClose} onSave={save} label="Update" />}
    >
      <FormGrid>
        <SelectField
          id="le-edit-ledger"
          label="Ledger Name"
          required
          searchable
          searchPlaceholder="Search ledger"
          className="sm:col-span-2"
          placeholder="Select ledger"
          options={options}
          value={target}
          error={error}
          disabled={saving}
          onValueChange={setTarget}
        />
        <Field id="le-edit-date" label="Date" value={row.date ?? ''} disabled readOnly />
        <Field id="le-edit-particular" label="Particular" value={row.particular ?? ''} disabled readOnly />
        <Field id="le-edit-debit" label="Debit" value={row.debit ?? ''} disabled readOnly />
        <Field id="le-edit-credit" label="Credit" value={row.credit ?? ''} disabled readOnly />
      </FormGrid>
    </Modal>
  )
}

const VOUCHER_TYPES = [
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
]

/**
 * ADD A BANK ENTRY to a ledger - POST tally/save_bank_entry/. The bank is
 * chosen for the user when the company has only one, as on the old screen.
 */
export function BankEntryModal({ companyId, ledgerName, onClose, onSaved }) {
  const dispatch = useDispatch()
  const banks = useSelector(selectBanks)
  const banksFor = useSelector(selectBanksCompanyId)
  const bankStatus = useSelector(selectBankStatus)

  const [form, setForm] = useState(() => ({ date: toInputDate(new Date()), amount: '', narration: '', bank: '', vouchertype: '' }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dispatch(fetchBanks({ companyId }))
  }, [dispatch, companyId])

  const bankNames = useMemo(
    () => (banksFor === companyId ? [...new Set(banks.map((bank) => bank.bank_name).filter(Boolean))] : []),
    [banks, banksFor, companyId],
  )
  const particular = form.bank || (bankNames.length === 1 ? bankNames[0] : '')

  const change = (changes) => setForm((previous) => ({ ...previous, ...changes }))

  const save = async () => {
    const found = checkBankEntry({ ...form, particular })
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      const reply = await saveBankEntry({
        leader_name: ledgerName,
        date: form.date,
        amount: Number(form.amount),
        narration: form.narration.trim(),
        particular,
        vouchertype: form.vouchertype,
        company_id: companyId,
      })
      toast.success(reply?.msg || 'Bank entry saved.')
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
      title="Add Bank Entry"
      closeOnBackdropClick={!saving}
      closeOnEsc={!saving}
      showCloseButton={!saving}
      footer={<ModalFooter saving={saving} onClose={onClose} onSave={save} label="Save" />}
    >
      <FormGrid>
        <Field id="le-bank-ledger" label="Ledger Name" className="sm:col-span-2" value={ledgerName} disabled readOnly />
        <Field
          id="le-bank-date"
          label="Date"
          required
          type="date"
          value={form.date}
          max={toInputDate(new Date())}
          error={errors.date}
          disabled={saving}
          onChange={(event) => change({ date: event.target.value })}
        />
        <Field
          id="le-bank-amount"
          label="Amount"
          required
          type="number"
          min="0"
          step="0.01"
          placeholder="Enter amount"
          value={form.amount}
          error={errors.amount}
          disabled={saving}
          onChange={(event) => change({ amount: event.target.value })}
        />
        <SelectField
          id="le-bank-name"
          label="Bank"
          required
          placeholder={
            bankNames.length > 0
              ? 'Select bank'
              : bankStatus === 'failed'
                ? 'Banks could not be loaded'
                : bankStatus === 'succeeded'
                  ? 'No bank accounts found'
                  : 'Loading banks...'
          }
          options={bankNames.map((name) => ({ value: name, label: name }))}
          value={particular}
          error={errors.particular}
          disabled={saving}
          onValueChange={(bank) => change({ bank })}
        />
        <SelectField
          id="le-bank-type"
          label="Voucher Type"
          required
          placeholder="Select voucher type"
          options={VOUCHER_TYPES}
          value={form.vouchertype}
          error={errors.vouchertype}
          disabled={saving}
          onValueChange={(vouchertype) => change({ vouchertype })}
        />
        <Field
          id="le-bank-narration"
          label="Narration"
          required
          className="sm:col-span-2"
          placeholder="Enter narration"
          value={form.narration}
          error={errors.narration}
          disabled={saving}
          onChange={(event) => change({ narration: event.target.value })}
        />
      </FormGrid>
    </Modal>
  )
}
