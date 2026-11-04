import { AlertTriangle, Plus } from 'lucide-react'

import { SelectField } from '@/Components/Common/FormFields'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatIndianCurrency } from '@/Utils/currency'

/**
 * The pieces every view's table is made of, so the three tables read alike:
 *
 *   <Amount value />                  rupees, tabular figures
 *   <Lines lines empty />             name ... amount, one per line
 *   <PartyCell entry ... />           the party ledger with its GSTIN and state,
 *                                     "Not in Tally" (Create, or "Creating..."),
 *                                     "Sent to Tally" when locked, and why it
 *                                     cannot be sent yet
 *   <LedgerPickCell ... />            a per-entry ledger pick over a default
 *   <VoucherPreview lines details />  the Dr / Cr lines an entry becomes
 */

export const Amount = ({ value, className }) => <span className={cn('tabular-nums', className)}>{formatIndianCurrency(value)}</span>

export function Lines({ lines, empty = '--' }) {
  if (lines.length === 0) return <span className="text-muted-foreground">{empty}</span>
  return (
    <ul className="space-y-0.5 text-xs">
      {lines.map((line, index) => (
        <li key={`${line.name}-${index}`} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate" title={line.name}>
            {line.name}
          </span>
          <Amount value={line.amount} className="shrink-0 text-muted-foreground" />
        </li>
      ))}
    </ul>
  )
}

export function PartyCell({ name, sub, notInTally, creating, onCreate, locked, problem, disabled, mappedFrom }) {
  return (
    <>
      <div className={cn('font-medium', !name && 'text-destructive')}>{name || 'No party ledger'}</div>
      {mappedFrom ? <div className="text-[11px] text-muted-foreground">Mapped from {mappedFrom}</div> : null}
      <div className="text-xs text-muted-foreground">{sub || '--'}</div>
      {notInTally ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            {creating ? 'Creating in Tally...' : 'Not in Tally'}
          </span>
          {onCreate && !creating ? (
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" icon={Plus} disabled={disabled} onClick={onCreate}>
              Create
            </Button>
          ) : null}
        </div>
      ) : null}
      {locked ? <div className="mt-1 text-[11px] font-medium text-brand">Sent to Tally</div> : null}
      {problem && !locked ? <div className="mt-1 text-[11px] text-destructive">{problem}</div> : null}
    </>
  )
}

/** A per-entry pick over the view's default: empty means "use the default". */
export function LedgerPickCell({ id, label, value, defaultValue, options, disabled, onChange }) {
  return (
    <SelectField
      id={id}
      ariaLabel={label}
      size="sm"
      searchable
      searchPlaceholder="Search ledger"
      placeholder={defaultValue ? `Default: ${defaultValue}` : 'Select ledger'}
      options={options}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      onClear={() => onChange(null)}
    />
  )
}

const PREVIEW_ROW = 'grid grid-cols-[3.5rem_minmax(0,1fr)_7rem_7rem] items-baseline gap-2 px-2 py-1'

/**
 * `lines` [{ side: 'Dr' | 'Cr', name, kind, amount }]; `details` [{ label, value }]
 * beside them. A grid, not a <table>: DataTable's cell rules would reach a nested table.
 */
export function VoucherPreview({ lines, details = [], note, children }) {
  return (
    <div className="space-y-3 bg-muted/40 px-3 py-3 text-xs">
      {children}
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-md border border-border bg-card" role="list" aria-label="Voucher lines">
          <div className={cn(PREVIEW_ROW, 'bg-muted font-semibold text-muted-foreground')}>
            <span>Dr / Cr</span>
            <span>Ledger</span>
            <span>From</span>
            <span className="text-right">Amount</span>
          </div>
          {lines.map((line, index) => (
            <div key={`${line.side}-${line.name}-${index}`} role="listitem" className={cn(PREVIEW_ROW, 'border-t border-border/60')}>
              <span className={cn('font-medium', line.side === 'Dr' ? 'text-brand' : 'text-foreground')}>{line.side}</span>
              <span className="min-w-0 break-words">{line.name}</span>
              <span className="text-muted-foreground">{line.kind}</span>
              <Amount value={line.amount} className="text-right" />
            </div>
          ))}
        </div>
        <dl className="space-y-1.5">
          {details.map((detail) => (
            <div key={detail.label}>
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="whitespace-pre-wrap">{detail.value || '--'}</dd>
            </div>
          ))}
          {note ? <p className="text-muted-foreground">{note}</p> : null}
        </dl>
      </div>
    </div>
  )
}
