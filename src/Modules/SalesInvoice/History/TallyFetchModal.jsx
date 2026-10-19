import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'

import { RetryButton } from '@/Components/Common/DataList'
import { SelectField } from '@/Components/Common/FormFields'
import { Modal } from '@/Components/Common/Modal'
import { MultiSelectField } from '@/Components/Common/MultiSelectField'
import { Button } from '@/Components/ui/button'
import {
  MONTH_OPTIONS,
  checkTallyRange,
  defaultTallyRange,
  tallyYearOptions,
} from '@/Modules/SalesInvoice/History/historyHelpers'
import { getTallyVoucherTypes } from '@/Services/salesInvoiceService'

/**
 * FETCH FROM TALLY - the range and the voucher types to bring over.
 *
 *   From Year / From Month, To Year / To Month   last, this and next year;
 *                       months by name, sent as their number. The To month
 *                       may not be before the From month (checkTallyRange),
 *                       checked as either is changed.
 *   Voucher Type        several at once (MultiSelectField: search, chips,
 *                       Select all), from tally/voucher-list/ for the
 *                       company - loaded when the modal opens
 *
 *   tallyFetch    useTallyInvoiceFetch(...) - Fetch sends through it, and the
 *                 modal stays open (and locked) until Tally has answered; it
 *                 is closed by the screen when the fetch succeeds
 */
export default function TallyFetchModal({ open, onOpenChange, companyName, tallyFetch }) {
  const [range, setRange] = useState(() => defaultTallyRange())
  const [voucherTypes, setVoucherTypes] = useState([])
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [vouchers, setVouchers] = useState({ forKey: null, status: 'ready', list: [], error: null })
  const years = useMemo(() => tallyYearOptions(), [])
  const busy = tallyFetch.fetching

  // Every opening starts with no voucher type chosen - they are picked again
  // for each fetch. The range is kept. Done as the modal opens (during that
  // render, not in an effect after it), so the old chips never flash.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setVoucherTypes([])
      setErrors((previous) => ({ ...previous, voucherTypes: undefined }))
    }
  }

  /* ---- the company's voucher types: once per company (and on Retry), when the modal opens ---- */
  const voucherKey = open && companyName ? `${companyName}#${attempt}` : null
  const loaded = useRef(new Set())
  useEffect(() => {
    if (!voucherKey || loaded.current.has(voucherKey)) return
    loaded.current.add(voucherKey)
    getTallyVoucherTypes(companyName)
      .then((list) => setVouchers({ forKey: voucherKey, status: 'ready', list, error: null }))
      .catch((failure) => setVouchers({ forKey: voucherKey, status: 'failed', list: [], error: failure.message }))
  }, [voucherKey, companyName])
  // The answer held is for this company and Retry - or the next one is on its way.
  const voucherStatus = vouchers.forKey === `${companyName}#${attempt}` ? vouchers.status : 'loading'
  const voucherList = voucherStatus === 'ready' ? vouchers.list : []

  /** A year or month changed: the range is checked again straight away, as the user sees it. */
  const setPart = (field) => (value) => {
    if (!value) return
    const next = { ...range, [field]: value }
    setRange(next)
    const found = checkTallyRange({ ...next, voucherTypes: voucherTypes.length ? voucherTypes : ['-'] })
    setErrors((previous) => ({ ...found, voucherTypes: previous.voucherTypes }))
  }

  const chooseVouchers = (next) => {
    setVoucherTypes(next)
    if (next.length > 0) setErrors((previous) => ({ ...previous, voucherTypes: undefined }))
  }

  const fetchNow = async () => {
    const found = checkTallyRange({ ...range, voucherTypes })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    await tallyFetch.start({ ...range, voucherTypes })
  }

  const yearSelect = (field, label) => (
    <SelectField id={`tally-${field}`} label={label} required options={years} value={range[field]} error={errors[field]} disabled={busy} onValueChange={setPart(field)} />
  )
  const monthSelect = (field, label) => (
    <SelectField id={`tally-${field}`} label={label} required options={MONTH_OPTIONS} value={range[field]} error={errors[field]} disabled={busy} onValueChange={setPart(field)} />
  )

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
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" icon={Download} loading={busy} onClick={fetchNow}>
            {busy ? 'Fetching from Tally...' : 'Fetch'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {yearSelect('startYear', 'From Year')}
          {monthSelect('startMonth', 'From Month')}
          {yearSelect('endYear', 'To Year')}
          {monthSelect('endMonth', 'To Month')}
        </div>

        <div className="space-y-1.5">
          <MultiSelectField
            id="tally-voucher-types"
            label="Voucher Type"
            required
            options={voucherList}
            value={voucherTypes}
            onChange={chooseVouchers}
            error={errors.voucherTypes}
            // Nothing to pick while the list is loading, failed or empty - the box says which.
            disabled={busy || voucherList.length === 0}
            placeholder={
              voucherStatus === 'loading'
                ? 'Loading voucher types...'
                : voucherStatus === 'failed'
                  ? 'Voucher types could not be loaded'
                  : voucherList.length === 0
                    ? 'Tally sent no voucher types for this company'
                    : 'Select voucher types'
            }
            searchPlaceholder="Search voucher type"
          />
          {voucherStatus === 'failed' ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {vouchers.error || 'The voucher types could not be loaded.'}
              <RetryButton onClick={() => setAttempt((count) => count + 1)} />
            </div>
          ) : null}
        </div>

        {tallyFetch.connection !== 'open' && !busy ? (
          <p className="text-xs text-muted-foreground">
            The live server is {tallyFetch.connection === 'connecting' ? 'connecting' : 'not connected'} - Fetch will connect it.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
