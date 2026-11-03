import { CheckCircle2, AlertCircle } from 'lucide-react'

import { Field, FieldLabel, SelectField, TextareaField } from '@/Components/Common/FormFields'
import { JV_SIDE } from '@/Constants/journalVoucher'
import { cn } from '@/Library/utils'
import { checkVoucher, matchName, voucherTotals } from '@/Modules/JournalVoucher/journalVoucher'
import { formatIndianCurrency } from '@/Utils/currency'

/**
 * ONE VOUCHER, EDITABLE - the same form for a voucher typed from a template,
 * one read from the Excel and one made from a bank entry:
 *
 *   <VoucherEditor idPrefix="jv-form" voucher={voucher} onChange={setVoucher}
 *                  ledgers={useCompanyLedgers(companyId)} lockLedgers />
 *
 *   voucher      { date, narration, legs: [{ side, ledger, amount }] } - see journalVoucher.js
 *   onChange     (next) => void, with the whole voucher
 *   ledgers      the company's ledgers (useCompanyLedgers): the choices, and
 *                what a ledger from a file is checked against
 *   lockLedgers  the template's ledgers are shown, not chosen - typing a
 *                voucher from a template only asks for the amounts
 *   header       what sits above the date - a Sr No and its buttons
 *
 * Its problems (checkVoucher) are shown as they arise; the caller works them
 * out again to decide whether Save may be pressed.
 */

/** Dr or Cr, in the brand's colours. */
function SideBadge({ side }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
        side === JV_SIDE.DR ? 'bg-brand text-brand-foreground' : 'bg-brand-soft text-brand dark:bg-brand/15',
      )}
    >
      {side}
    </span>
  )
}

/** Dr and Cr added up, and whether they meet. */
export function BalanceStatus({ voucher }) {
  const { dr, cr, difference } = voucherTotals(voucher)
  const empty = dr === 0 && cr === 0
  const balanced = !empty && dr > 0 && cr > 0 && difference === 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <span>
        Total Dr: <span className="font-semibold tabular-nums">{formatIndianCurrency(dr)}</span>
      </span>
      <span>
        Total Cr: <span className="font-semibold tabular-nums">{formatIndianCurrency(cr)}</span>
      </span>
      <span
        role="status"
        className={cn(
          'ml-auto flex items-center gap-1 font-medium',
          empty ? 'text-muted-foreground' : balanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
        )}
      >
        {empty ? (
          'Enter the amounts'
        ) : balanced ? (
          <>
            <CheckCircle2 className="size-3.5" /> Balanced
          </>
        ) : (
          <>
            <AlertCircle className="size-3.5" />
            {dr === 0 || cr === 0 ? 'Needs both Dr and Cr' : `Difference: ${formatIndianCurrency(difference)}`}
          </>
        )}
      </span>
    </div>
  )
}

export default function VoucherEditor({ idPrefix, voucher, onChange, ledgers, lockLedgers = false, disabled = false, header }) {
  const errors = checkVoucher(voucher, ledgers.lookup)

  const setLeg = (index, changes) =>
    onChange({ ...voucher, legs: voucher.legs.map((leg, at) => (at === index ? { ...leg, ...changes } : leg)) })

  /** The company's ledgers, plus a ledger from a file the list does not hold - a select shows only what it offers. */
  const optionsFor = (ledger) =>
    ledger && ledgers.lookup && !matchName(ledgers.lookup, ledger)
      ? [{ value: ledger, label: `${ledger} (not found)` }, ...ledgers.options]
      : ledgers.options

  return (
    <div className="space-y-3">
      {header}

      <Field
        id={`${idPrefix}-date`}
        label="Date"
        required
        type="date"
        className="max-w-48"
        value={voucher.date}
        error={errors.date}
        disabled={disabled}
        onChange={(event) => onChange({ ...voucher, date: event.target.value })}
      />

      <div className="space-y-2">
        <div className="hidden grid-cols-[3rem_minmax(0,1fr)_10rem] gap-2 sm:grid">
          <span />
          <FieldLabel>Ledger Account</FieldLabel>
          <FieldLabel>Amount</FieldLabel>
        </div>

        {voucher.legs.map((leg, index) => (
          <div
            key={`${leg.side}-${index}`}
            className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3rem_minmax(0,1fr)_10rem]"
          >
            <SideBadge side={leg.side} />

            {lockLedgers ? (
              <div
                className="flex h-9 min-w-0 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium"
                title={leg.ledger}
              >
                <span className="truncate">{leg.ledger}</span>
              </div>
            ) : (
              <SelectField
                id={`${idPrefix}-ledger-${index}`}
                ariaLabel={`${leg.side} ledger ${index + 1}`}
                searchable
                searchPlaceholder="Search ledger"
                placeholder={ledgers.loading ? 'Loading ledgers...' : 'Select ledger'}
                options={optionsFor(leg.ledger)}
                value={leg.ledger}
                disabled={disabled}
                onValueChange={(value) => setLeg(index, { ledger: value })}
              />
            )}

            <Field
              id={`${idPrefix}-amount-${index}`}
              aria-label={`${leg.side} amount for ${leg.ledger || `ledger ${index + 1}`}`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              className="col-start-2 sm:col-start-auto"
              inputClassName="text-right tabular-nums"
              value={leg.amount}
              disabled={disabled}
              onWheel={(event) => event.currentTarget.blur()}
              onChange={(event) => setLeg(index, { amount: event.target.value })}
            />

            {errors[`leg-${index}`] ? (
              <p className="col-start-2 text-xs text-destructive sm:col-span-2">{errors[`leg-${index}`]}</p>
            ) : null}
          </div>
        ))}
      </div>

      <BalanceStatus voucher={voucher} />

      <TextareaField
        id={`${idPrefix}-narration`}
        label="Narration"
        rows={2}
        placeholder="Enter voucher narration details here..."
        value={voucher.narration}
        disabled={disabled}
        onChange={(event) => onChange({ ...voucher, narration: event.target.value })}
      />
    </div>
  )
}
