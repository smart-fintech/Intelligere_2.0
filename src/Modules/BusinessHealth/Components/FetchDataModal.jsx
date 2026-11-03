import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import useTallySync from '@/Modules/PayableReceivable/useTallySync'
import { MONTH_OPTIONS, tallyYearOptions } from '@/Modules/SalesInvoice/History/historyHelpers'
import useTallyInvoiceFetch from '@/Modules/SalesInvoice/History/useTallyInvoiceFetch'
import useVoucherTypes from '@/Modules/SalesInvoice/Voucher/useVoucherTypes'
import { TALLY_BANK_TRANSACTIONS_MODULE, buildBankTransactionsMessage } from '@/Services/businessHealthService'
import { TALLY_RECEIVABLE_PAYABLE_MODULE, buildReceivablePayableSyncMessage } from '@/Services/payableReceivableService'

/**
 * FETCH DATA (old FetchEntries) - bring what the reports read over from
 * Tally, through the Tally operations the app already has:
 *
 *   Sales, Purchase        tally_invoice_fetch (useTallyInvoiceFetch, as Sales
 *                          Invoice History's Fetch from Tally), for the chosen
 *                          year and months and voucher types - Sales offers the
 *                          sales / credit / debit groups, Purchase the purchase
 *                          / credit / debit ones, as the old modal did
 *   Bank                   get_bank_transactions (useTallySync), year + months
 *   Receivable / Payable   receivable_payable (useTallySync, as Payable
 *                          Receivable's Sync Now) - every pending bill, which
 *                          replaces what was there; the Tally agent takes no
 *                          years for it any more
 *
 * One year with a From and To month, as the old modal: a To month before the
 * From month runs into the next year. While Tally works the modal stays open
 * and locked (a second Fetch is ignored); Tally's answer closes it and the
 * hooks say how it went. `onFetched` runs after a fetch that worked.
 */

const FETCH_TYPE = Object.freeze({ SALES: 'sales', PURCHASE: 'purchase', BANK: 'bank', REC_PAY: 'rec_pay' })

const FETCH_TYPE_OPTIONS = [
  { value: FETCH_TYPE.SALES, label: 'Sales' },
  { value: FETCH_TYPE.PURCHASE, label: 'Purchase' },
  { value: FETCH_TYPE.BANK, label: 'Bank' },
  { value: FETCH_TYPE.REC_PAY, label: 'Receivable / Payable' },
]

/** The voucher groups each invoice fetch offers - the old modal's filter. */
const VOUCHER_GROUP_WORDS = {
  [FETCH_TYPE.SALES]: ['sales', 'credit', 'debit'],
  [FETCH_TYPE.PURCHASE]: ['purchase', 'credit', 'debit'],
}

const EMPTY_FORM = { year: String(new Date().getFullYear()), startMonth: '', endMonth: '', voucherTypes: [] }

export default function FetchDataModal({ open, onOpenChange, companyName, onFetched }) {
  const [type, setType] = useState(FETCH_TYPE.SALES)
  const [form, setForm] = useState(EMPTY_FORM)
  const years = useMemo(() => tallyYearOptions(), [])
  const isInvoices = type === FETCH_TYPE.SALES || type === FETCH_TYPE.PURCHASE

  const done = () => {
    onOpenChange(false)
    onFetched?.(type)
  }
  const invoiceFetch = useTallyInvoiceFetch({ companyName, onSuccess: done })
  const bankSync = useTallySync({
    moduleName: TALLY_BANK_TRANSACTIONS_MODULE,
    companyName,
    buildMessage: buildBankTransactionsMessage,
    messages: { done: 'Bank transactions fetched from Tally.', failed: 'Tally could not fetch the bank transactions.' },
    onSuccess: done,
  })
  const recPaySync = useTallySync({
    moduleName: TALLY_RECEIVABLE_PAYABLE_MODULE,
    companyName,
    buildMessage: buildReceivablePayableSyncMessage,
    messages: { done: 'Payables and receivables synced from Tally.', failed: 'Tally could not sync the payables and receivables.' },
    onSuccess: done,
  })
  const busy = invoiceFetch.fetching || bankSync.syncing || recPaySync.syncing

  const voucherList = useVoucherTypes(companyName, open && isInvoices)
  const voucherOptions = useMemo(() => {
    const words = VOUCHER_GROUP_WORDS[type] ?? []
    return voucherList.types
      .filter((voucher) => words.some((word) => voucher.group.toLowerCase().includes(word)))
      .map((voucher) => voucher.name)
  }, [voucherList.types, type])

  const set = (changes) => setForm((previous) => ({ ...previous, ...changes }))

  const changeType = (next) => {
    setType(next)
    setForm(EMPTY_FORM)
  }

  const ready =
    type === FETCH_TYPE.REC_PAY ||
    (form.startMonth && form.endMonth && (!isInvoices || form.voucherTypes.length > 0))

  const fetchNow = () => {
    if (!ready || busy) return
    if (type === FETCH_TYPE.REC_PAY) return recPaySync.start()
    if (type === FETCH_TYPE.BANK) return bankSync.start(form)

    const year = Number(form.year)
    return invoiceFetch.start({
      startYear: year,
      startMonth: form.startMonth,
      endYear: Number(form.endMonth) < Number(form.startMonth) ? year + 1 : year,
      endMonth: form.endMonth,
      voucherTypes: form.voucherTypes,
    })
  }

  const label = FETCH_TYPE_OPTIONS.find((option) => option.value === type).label

  return (
    <Modal
      open={open}
      // While Tally is working the modal cannot be dismissed - its answer is what closes it.
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Fetch Entries"
      description={companyName}
      closeOnBackdropClick={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" icon={Download} loading={busy} disabled={!ready} onClick={fetchNow}>
            {busy ? 'Fetching your data...' : `Fetch ${label} Data`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ViewSwitch
          options={FETCH_TYPE_OPTIONS}
          value={type}
          onValueChange={(next) => !busy && changeType(next)}
          label="What to fetch"
          idPrefix="bh-fetch"
          className="w-full"
        />

        {type === FETCH_TYPE.REC_PAY ? (
          <p className="text-sm text-muted-foreground">
            Brings every pending bill over from Tally. All previous receivable and payable data will be replaced.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField id="bh-fetch-year" label="Year" options={years} value={form.year} disabled={busy} onValueChange={(year) => set({ year })} />
            <SelectField
              id="bh-fetch-from"
              label="From Month"
              placeholder="From Month"
              options={MONTH_OPTIONS}
              value={form.startMonth}
              disabled={busy}
              onValueChange={(startMonth) => set({ startMonth })}
            />
            <SelectField
              id="bh-fetch-to"
              label="To Month"
              placeholder="To Month"
              options={MONTH_OPTIONS}
              value={form.endMonth}
              disabled={busy}
              onValueChange={(endMonth) => set({ endMonth })}
            />
          </div>
        )}

        {isInvoices ? (
          <MultiSelectField
            id="bh-fetch-vouchers"
            label="Voucher Type"
            required
            options={voucherOptions}
            value={form.voucherTypes}
            onChange={(voucherTypes) => set({ voucherTypes })}
            disabled={busy || voucherOptions.length === 0}
            placeholder={
              voucherList.status === 'loading'
                ? 'Loading voucher types...'
                : voucherList.status === 'failed'
                  ? voucherList.error || 'Voucher types could not be loaded'
                  : voucherOptions.length === 0
                    ? 'Tally sent no voucher types for this'
                    : 'Select voucher types'
            }
            searchPlaceholder="Search voucher type"
          />
        ) : null}
      </div>
    </Modal>
  )
}
