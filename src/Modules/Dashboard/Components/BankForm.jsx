/**
 * The Bank Form card, on the left of the Bank Details page.
 *
 * ------------------------------------------------------------------
 * ONE FORM, TWO MODES
 * ------------------------------------------------------------------
 * There is no separate edit screen. `bank` decides which mode this is:
 *
 *   bank = null    ADD    empty fields, POST a new account
 *   bank = {...}   EDIT   fields filled from that row, PUT the changes
 *
 * The fields start filled in from `bank` as the component mounts - there is
 * no effect copying the row into state afterwards. BankDetails gives this
 * component a `key` that changes with the row being edited, so React remounts
 * it and the initialiser runs again. That is what keeps this form free of
 * effects entirely.
 *
 * ------------------------------------------------------------------
 * IT FETCHES NOTHING
 * ------------------------------------------------------------------
 * Both dropdowns are filled from the store, which BankDetails asks for once:
 *
 *   Bank Name     the bank list          (Store/Slices/bankSlice)
 *   Bank Ledger   the company's ledgers  (Store/Slices/ledgerSlice - the SAME
 *                 list the Ledger Details page shows, handed in as `ledgers`)
 *
 * Opening this form, switching it into edit mode, typing in it, or picking a
 * ledger never causes a request - only Save does.
 *
 * ------------------------------------------------------------------
 * PICKING A LEDGER FILLS IN THE ACCOUNT
 * ------------------------------------------------------------------
 * A ledger may already carry its bank's account number (`ledger_accno`) and
 * IFSC (`ledger_ifsc`). Choosing it copies both into the fields below -
 * straight from the ledger object already in memory, no lookup request. A
 * value the ledger does not have leaves that field empty.
 *
 * It happens only when the CHOICE changes: typing into the account fields
 * afterwards is never undone, and reopening the dropdown without picking a
 * different ledger changes nothing.
 *
 * Props:
 *   bank          the row being edited, or null to add a new one
 *   companyId     the selected company - what a new account is filed under
 *   companyName   shown read-only, so the user can see what they are adding to
 *   ledgers       the company's ledgers, for the Bank Ledger dropdown
 *   ledgersStatus 'idle' | 'loading' | 'succeeded' | 'failed'
 *   ledgersError  the message when they could not be loaded
 *   onRetryLedgers()  asks for them again
 *   onSaved()     called after a successful save, so the list can refresh
 *   onCancel()    leaves edit mode and goes back to an empty form
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Building2, Hash, Landmark, MapPin } from 'lucide-react'

import { InlineAlert, RetryButton } from '@/Components/Common/DataList'
import { Field, FormActions, FormGrid, SelectField } from '@/Components/Common/FormFields'
import { Panel } from '@/Components/Common/Panel'
import { Button } from '@/Components/ui/button'
import { toast } from '@/Library/toast'
import { addBank, updateBank } from '@/Services/bankService'
import { getLedgerId } from '@/Services/ledgerService'
import {
  selectBankNames,
  selectBankOptionsError,
  selectBankOptionsStatus,
} from '@/Store/Slices/bankSlice'

// The four fields the backend asks for, named exactly as it names them, so
// the payload is the form with nothing renamed on the way out.
const EMPTY_FORM = {
  bank_name: '',
  bank_ledger_name: '',
  account_no: '',
  ifsc_code: '',
}

/** A ledger's optional text field, as a form value - null and blanks become ''. */
const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim())

export default function BankForm({
  bank,
  companyId,
  companyName,
  ledgers,
  ledgersStatus,
  ledgersError,
  onRetryLedgers,
  onSaved,
  onCancel,
}) {
  const editing = Boolean(bank)

  const names = useSelector(selectBankNames)
  const optionsStatus = useSelector(selectBankOptionsStatus)
  const optionsError = useSelector(selectBankOptionsError)

  const [form, setForm] = useState(() =>
    bank
      ? {
        // `?? ''` because a column the backend has not filled in comes back
        // as null, and null in an <input> makes it uncontrolled.
        bank_name: bank.bank_name ?? '',
        bank_ledger_name: bank.bank_ledger_name ?? '',
        account_no: bank.account_no ?? '',
        ifsc_code: bank.ifsc_code ?? '',
      }
      : EMPTY_FORM,
  )
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // One handler for every field. Editing a field also clears its error, so a
  // message disappears as soon as the user starts fixing it rather than
  // sitting there until the next save.
  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  /*
   * The Bank Ledger dropdown works in ledger ids (`ledger_obj_id`), but what
   * the bank API stores is the ledger's NAME (`bank_ledger_name`). The form
   * keeps only the name - the one value that is saved - and the dropdown's
   * value is worked out from it here, so the two can never disagree.
   *
   * A bank saved against a ledger name that is not in the list any more
   * matches nothing; its name is then shown as the dropdown's placeholder
   * rather than silently disappearing.
   */
  const selectedLedger = ledgers.find((ledger) => ledger.ledeger_name === form.bank_ledger_name)

  /** A ledger was picked: take its name, and its account details if it has them. */
  const selectLedger = (value) => {
    const ledger = ledgers.find((entry) => String(getLedgerId(entry)) === value)
    if (!ledger) return

    setForm((previous) => ({
      ...previous,
      bank_ledger_name: ledger.ledeger_name ?? '',
      // Whatever the ledger holds, and empty where it holds nothing - the
      // user chose a different ledger, so the previous one's details go.
      account_no: textOf(ledger.ledger_accno),
      ifsc_code: textOf(ledger.ledger_ifsc).toUpperCase(),
    }))
    setErrors((previous) => ({ ...previous, bank_ledger_name: undefined, account_no: undefined }))
  }

  /**
   * Checks the form and returns an object of error messages.
   * An empty object means everything passed.
   *
   * Only "is it filled in" is checked. Neither the account number nor the
   * IFSC code is given a format rule on purpose: the accounts the backend
   * already holds do not follow one, so a stricter form here would refuse to
   * edit rows that are perfectly valid to it.
   */
  const validate = () => {
    const found = {}

    if (!form.bank_name) found.bank_name = 'Please select a bank'
    if (!form.bank_ledger_name) found.bank_ledger_name = 'Please select a ledger'
    if (!form.account_no.trim()) found.account_no = 'Account number is required'

    return found
  }

  /**
   * What to send when editing.
   *
   * The backend identifies the row by `id` and updates only the fields that
   * arrive with it, so just the ones the user actually changed go up - which
   * is what the API's own example does.
   */
  const buildEditPayload = () => {
    const changed = Object.keys(EMPTY_FORM).reduce((payload, field) => {
      const value = form[field].trim()
      if (value !== (bank[field] ?? '')) payload[field] = value
      return payload
    }, {})

    return Object.keys(changed).length > 0 ? { id: bank.id, ...changed } : null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    // A new account has to be filed under a company. This cannot normally
    // happen - the button is disabled without one - but it is worth saying
    // rather than sending a bank with no owner.
    if (!editing && !companyId) {
      toast.error('Select a company before adding a bank account.')
      return
    }

    setSubmitting(true)

    try {
      let response

      if (editing) {
        const payload = buildEditPayload()

        if (!payload) {
          toast.info('Nothing has been changed.')
          setSubmitting(false)
          return
        }

        response = await updateBank(payload)
      } else {
        response = await addBank({
          bank_name: form.bank_name,
          bank_ledger_name: form.bank_ledger_name,
          // Trimmed here, once, so no stray space is ever saved.
          account_no: form.account_no.trim(),
          ifsc_code: form.ifsc_code.trim(),
          // Never typed by the user - it is the company the header is on.
          comp_id: companyId,
        })
      }

      // The backend's own wording is shown when it sends one.
      toast.success(
        response?.msg || (editing ? 'Bank updated successfully.' : 'Bank added successfully.'),
      )

      if (!editing) setForm(EMPTY_FORM)
      // The list is refreshed ONCE by the parent, which also takes the form
      // back out of edit mode.
      onSaved?.()
    } catch (failure) {
      // `failure.message` is the backend's own text (see authService).
      toast.error(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 'idle' counts as loading: the page dispatches the options fetch as it
  // mounts, so idle only ever lasts a moment.
  const loadingOptions = optionsStatus === 'loading' || optionsStatus === 'idle'
  const busy = submitting || loadingOptions

  const loadingLedgers = ledgersStatus === 'loading' || ledgersStatus === 'idle'
  const ledgerPlaceholder = loadingLedgers
    ? 'Loading...'
    : form.bank_ledger_name || (ledgers.length === 0 ? 'No ledgers found' : 'Select Bank Ledger')

  return (
    <Panel title={editing ? 'Edit Bank' : 'Bank Form'}>
      {/* The dropdowns could not be fetched. Without the bank list there is
          nothing to choose from, so this is said plainly. Nothing retries on
          its own - the page's Retry reloads the options too. */}
      {optionsError ? <InlineAlert>{optionsError}</InlineAlert> : null}

      {/* Same for the ledgers - without them there is no ledger to pick. */}
      {ledgersError ? (
        <InlineAlert action={<RetryButton onClick={onRetryLedgers} />}>
          Ledgers could not be loaded. {ledgersError}
        </InlineAlert>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* ---------------- Selected company ----------------
            Read-only: the company comes from the header's picker, and this is
            here so the user can see what they are filing under. */}
        <Field
          id="selected_company"
          label="Selected Company"
          required
          readOnly
          value={companyName || 'No company selected'}
        />

        {/* ---------------- Bank name ----------------
            Chosen from bank_statement/allbanklist/, never typed: the name has
            to match one the backend knows. */}
        <SelectField
          id="bank_name"
          label="Select Bank Name"
          required
          icon={Landmark}
          placeholder={loadingOptions ? 'Loading...' : 'Select Bank Name'}
          value={form.bank_name}
          error={errors.bank_name}
          disabled={busy}
          onValueChange={(value) => setField('bank_name', value)}
          // `bank_name` is both what is shown and what is sent - the POST
          // payload's `bank_name` field is the name itself, not the id.
          options={names.map((entry) => ({
            value: entry.bank_name,
            label: entry.bank_name,
          }))}
        />

        {/* ---------------- Bank ledger ----------------
            Every ledger of this company, from the ledger list - labelled by
            name, valued by `ledger_obj_id`. Picking one fills in the account
            number and IFSC below when the ledger has them. Searchable,
            because a company can have a great many ledgers. */}
        <SelectField
          id="bank_ledger_name"
          label="Select Bank Ledger"
          required
          icon={Building2}
          placeholder={ledgerPlaceholder}
          value={selectedLedger ? String(getLedgerId(selectedLedger)) : ''}
          error={errors.bank_ledger_name}
          disabled={submitting || loadingLedgers || ledgers.length === 0}
          searchable
          searchPlaceholder="Search ledger..."
          onValueChange={selectLedger}
          options={ledgers.map((ledger) => ({
            value: String(getLedgerId(ledger)),
            label: ledger.ledeger_name,
          }))}
        />
        <FormGrid>
          <Field
            id="account_no"
            label="Bank Account Number"
            required
            icon={Hash}
            value={form.account_no}
            error={errors.account_no}
            disabled={submitting}
            onChange={(e) => setField('account_no', e.target.value)}
          />

          <Field
            id="ifsc_code"
            label="Bank IFSC Code"
            icon={MapPin}
            // Typed in lower case, stored in upper - the user does not have to
            // hold shift for the whole code.
            value={form.ifsc_code}
            disabled={submitting}
            inputClassName="uppercase"
            onChange={(e) => setField('ifsc_code', e.target.value.toUpperCase())}
          />

        </FormGrid>
        {/* ---------------- Actions ----------------
            Cancel only exists while editing - there is nothing to go back to
            from an empty form. */}
        <FormActions>
          {editing ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          ) : null}

          <Button type="submit" loading={submitting} disabled={loadingOptions || !companyId}>
            {submitting ? 'Saving...' : editing ? 'Update Bank' : 'Add Bank'}
          </Button>
        </FormActions>
      </form>
    </Panel>
  )
}
