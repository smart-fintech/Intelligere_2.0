import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Button } from '@/Components/ui/button'
import { TALLY_FETCH_VOUCHER_GROUPS } from '@/Constants/salesEntries'
import { MONTH_OPTIONS, tallyYearOptions } from '@/Modules/SalesInvoice/History/historyHelpers'
import useVoucherTypes from '@/Modules/SalesInvoice/Voucher/useVoucherTypes'

/**
 * FETCH FROM TALLY - the period and the voucher types to bring over.
 *
 *   Year, From Month, To Month   one year and two months, as the agent takes
 *                                them. A To month before the From month runs
 *                                into the next year (Apr -> Mar is a financial
 *                                year) - the line under the fields says which.
 *   Voucher Type                 several at once, from tally/voucher-list/ (the
 *                                shared cache, useVoucherTypes): the types of
 *                                the sales, credit note and debit note groups
 *
 *   tallyFetch   useSalesTallyFetch - Fetch sends through it, and the modal
 *                stays open (and locked) until Tally has answered
 */

const monthName = (value) => MONTH_OPTIONS.find((month) => month.value === String(value))?.label ?? ''

/** The period the agent will read, in words: "April 2026 - March 2027". */
const describePeriod = ({ year, startMonth, endMonth }) => {
  if (!year || !startMonth || !endMonth) return ''
  const endYear = Number(endMonth) < Number(startMonth) ? Number(year) + 1 : Number(year)
  return `${monthName(startMonth)} ${year} - ${monthName(endMonth)} ${endYear}`
}

const isFetchGroup = (group) => TALLY_FETCH_VOUCHER_GROUPS.some((word) => group.toLowerCase().includes(word))

export default function SalesTallyFetchModal({ open, onOpenChange, companyName, tallyFetch }) {
  const [range, setRange] = useState(() => {
    const month = String(new Date().getMonth() + 1)
    return { year: String(new Date().getFullYear()), startMonth: month, endMonth: month }
  })
  const [voucherTypes, setVoucherTypes] = useState([])
  const [error, setError] = useState(null)
  const years = useMemo(() => tallyYearOptions(), [])
  const busy = tallyFetch.busy

  const vouchers = useVoucherTypes(companyName, open)
  const voucherList = useMemo(
    () => [...new Set(vouchers.types.filter((type) => !type.group || isFetchGroup(type.group)).map((type) => type.name))],
    [vouchers.types],
  )

  const setPart = (field) => (value) => value && setRange((previous) => ({ ...previous, [field]: value }))

  const chooseVouchers = (next) => {
    setVoucherTypes(next)
    if (next.length > 0) setError(null)
  }

  const fetchNow = async () => {
    if (voucherTypes.length === 0) {
      setError('Please select at least one voucher type')
      return
    }
    await tallyFetch.start({ ...range, voucherTypes })
  }

  const loadingTypes = vouchers.status === 'loading' || vouchers.status === 'idle'

  return (
    <Modal
      open={open}
      // While Tally is working the modal cannot be dismissed - its answer is what closes it.
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Fetch from Tally"
      description={companyName}
      closeOnBackdropClick={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      footer={
        <>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" icon={Download} loading={busy} onClick={fetchNow}>
            {busy ? 'Fetching from Tally...' : 'Fetch'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
          <SelectField id="sales-fetch-year" label="Year" required options={years} value={range.year} disabled={busy} onValueChange={setPart('year')} />
          <SelectField id="sales-fetch-from" label="From Month" required options={MONTH_OPTIONS} value={range.startMonth} disabled={busy} onValueChange={setPart('startMonth')} />
          <SelectField id="sales-fetch-to" label="To Month" required options={MONTH_OPTIONS} value={range.endMonth} disabled={busy} onValueChange={setPart('endMonth')} />
        </div>
        <p className="text-xs text-muted-foreground">
          Period: <span className="font-medium text-foreground">{describePeriod(range)}</span>
        </p>

        <div className="space-y-1.5">
          <MultiSelectField
            id="sales-fetch-voucher-types"
            label="Voucher Type"
            required
            options={voucherList}
            value={voucherTypes}
            onChange={chooseVouchers}
            error={error}
            disabled={busy || voucherList.length === 0}
            placeholder={
              loadingTypes
                ? 'Loading voucher types...'
                : vouchers.status === 'failed'
                  ? 'Voucher types could not be loaded'
                  : voucherList.length === 0
                    ? 'Tally sent no sales voucher types for this company'
                    : 'Select voucher types'
            }
            searchPlaceholder="Search voucher type"
          />
          {vouchers.status === 'failed' ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {vouchers.error || 'The voucher types could not be loaded.'}
              <RetryButton onClick={vouchers.reload} />
            </div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Tally sends back a CSV in the upload format. It downloads when the fetch is done - check it, then upload it on this page.
        </p>
      </div>
    </Modal>
  )
}
