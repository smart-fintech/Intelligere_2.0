import { Table, TableBody, TableCell, TableRow } from '@/Components/ui/table'
import { entriesOf } from '@/Modules/AmountDistribution/amountDistribution'
import { formatIndianCurrency } from '@/Utils/currency'
import { formatDate } from '@/Utils/date'

/**
 * One ledger's share of a generated distribution: what it is, then its entries
 * side by side, one column each - a long run scrolls sideways inside the table.
 *
 *   row   one item of the reply's `data`
 */

const headingClass = 'w-24 min-w-24 font-medium text-brand'

export default function DistributionResult({ row }) {
  const entries = entriesOf(row)

  const details = [
    ['From Ledger', row.opposite_ledger],
    ['To Ledger', row.ledger],
    ['Total Amount', formatIndianCurrency(row.total_amount)],
    ['Mode', row.mode],
    ['Voucher Type', row.Voucher_type],
    ['Entries', row.entries ?? entries.length],
    ['Narration', row.narration],
  ]

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">{value || value === 0 ? value : '--'}</dd>
          </div>
        ))}
      </dl>

      <Table className="text-xs">
        <TableBody>
          <TableRow>
            <TableCell className={headingClass}>Date</TableCell>
            {entries.map((entry, index) => (
              <TableCell key={index}>{formatDate(entry.date)}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className={headingClass}>Day</TableCell>
            {entries.map((entry, index) => (
              <TableCell key={index}>{entry.day ?? '--'}</TableCell>
            ))}
          </TableRow>
          <TableRow>
            <TableCell className={headingClass}>Amount</TableCell>
            {entries.map((entry, index) => (
              <TableCell key={index}>{formatIndianCurrency(entry.amount)}</TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
