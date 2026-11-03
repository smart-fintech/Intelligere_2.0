import { TableCell, TableHead, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'
import { formatAmount, toneOf } from '@/Modules/GstCompare/gstCompareModel'

/** What each colour says - see toneOf. */
const TONE_CLASS = {
  ok: 'bg-emerald-50 dark:bg-emerald-950/40',
  bad: 'bg-red-100 dark:bg-red-950/50',
  rcm: 'bg-yellow-50 dark:bg-yellow-950/40',
}

/** One cell, in the colour of how its field compared. */
export function ToneCell({ tone, className, children }) {
  return <TableCell className={cn('px-2 py-1.5 text-xs', TONE_CLASS[tone], className)}>{children}</TableCell>
}

const AMOUNTS = ['Taxable Value', 'IGST', 'CGST', 'SGST']

const HEAD_CLASS = 'whitespace-nowrap px-2 text-xs'

/** The heading of the columns both tables share. `lead` and `trail` are their own columns. */
export function CompareHeadRow({ lead = 0, trail = 0, showName, showInvoiceValue }) {
  return (
    <TableRow>
      {Array.from({ length: lead }, (_, index) => (
        <TableHead key={index} className={HEAD_CLASS} />
      ))}
      <TableHead className={HEAD_CLASS}>No.</TableHead>
      {showName ? <TableHead className={HEAD_CLASS}>Supplier Name</TableHead> : null}
      <TableHead className={HEAD_CLASS}>GST No.</TableHead>
      <TableHead className={HEAD_CLASS}>Type</TableHead>
      <TableHead className={HEAD_CLASS}>Invoice Date</TableHead>
      <TableHead className={HEAD_CLASS}>Invoice No.</TableHead>
      {showInvoiceValue ? <TableHead className={cn(HEAD_CLASS, 'text-right')}>Invoice Value</TableHead> : null}
      {AMOUNTS.map((field) => (
        <TableHead key={field} className={cn(HEAD_CLASS, 'text-right')}>
          {field}
        </TableHead>
      ))}
      {Array.from({ length: trail }, (_, index) => (
        <TableHead key={index} className={HEAD_CLASS} />
      ))}
    </TableRow>
  )
}

/** The row number and the party cells. */
export function IdentityCells({ rowKey, item, showName }) {
  const tone = toneOf(item, rowKey, 'GST No.')
  return (
    <>
      <ToneCell tone={tone}>{rowKey}</ToneCell>
      {showName ? <ToneCell tone={tone}>{item['Supplier Name']}</ToneCell> : null}
      <ToneCell tone={tone}>{item['GST No.']}</ToneCell>
      <ToneCell tone={tone}>{item.v_type}</ToneCell>
    </>
  )
}

/** The amount cells; Invoice Value only when it is switched on. */
export function AmountCells({ rowKey, item, showInvoiceValue }) {
  const fields = showInvoiceValue ? ['Invoice Value', ...AMOUNTS] : AMOUNTS
  return fields.map((field) => (
    <ToneCell key={field} tone={toneOf(item, rowKey, field)} className="text-right tabular-nums">
      {formatAmount(item[field])}
    </ToneCell>
  ))
}

/** Says rows are still being drawn - a real count, see useProgressiveCount. */
export function DrawingRows({ shown, total }) {
  if (shown >= total) return null
  return (
    <p role="status" className="text-xs text-muted-foreground">
      Loading rows... {shown.toLocaleString()} of {total.toLocaleString()}
    </p>
  )
}

/** The heading over the unmatched rows, and the line saying when there are none. */
export function UnmatchedHeading({ colSpan, label, empty }) {
  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="px-2 py-2 text-sm font-semibold text-brand">
          Unmatched Entries <span className="ml-3">{label}</span>
        </TableCell>
      </TableRow>
      {empty ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colSpan} className={cn('px-2 py-2 text-center text-xs', TONE_CLASS.bad)}>
            No Unmatch Entries Found
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}
