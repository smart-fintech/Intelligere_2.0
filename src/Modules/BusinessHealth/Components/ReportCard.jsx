import { Info } from 'lucide-react'

import { Card, CardContent } from '@/Components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { Tooltip } from '@/Components/ui/tooltip'
import { cn } from '@/Library/utils'
import { isHealthy } from '@/Modules/BusinessHealth/businessHealth'

/**
 * One generated report (the old RatioCard): its title, the period or periods
 * it covers, the industry range, and the report's own view of the answer.
 *
 *   no comparative period   report.Plain(data, benchmark) - the sentence, at
 *                           half width - and the "Talk to an Expert" line
 *   a comparative period    report.Comparison(data) - the table, full width
 *                           (a report without one keeps its plain view)
 */
export function ReportCard({ report, data, period, comparativePeriod, benchmark }) {
  const comparing = Boolean(comparativePeriod && report.Comparison)

  return (
    <Card className={cn('border-border/70', !comparing && 'lg:w-1/2')}>
      <CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-brand">
              {report.label}
              {report.infoMessage ? (
                <Tooltip text={report.infoMessage}>
                  <span tabIndex={0} aria-label={report.infoMessage} className="text-brand">
                    <Info className="size-4" />
                  </span>
                </Tooltip>
              ) : null}
            </h2>
            <p className="text-xs text-muted-foreground">
              Period : <b>{period}</b>
            </p>
            {comparativePeriod ? (
              <p className="text-xs text-muted-foreground">
                Comparative Period : <b>{comparativePeriod}</b>
              </p>
            ) : null}
          </div>

          {benchmark ? (
            <p className="text-sm">
              Range: <span className="font-bold">{benchmark.display}</span>
            </p>
          ) : null}
        </div>

        {comparing ? (
          report.Comparison(data)
        ) : (
          <>
            {report.Plain(data, benchmark)}
            <p className="text-sm font-medium text-brand">Talk to an Expert. Improve Your Numbers.</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The shaded box a report's sentence sits in. */
export function NoteBox({ children }) {
  return <div className="rounded-xl bg-muted/50 p-4 text-sm">{children}</div>
}

/** A figure inside a sentence. */
export function Figure({ children }) {
  return <span className="mx-3 text-lg font-semibold">{children}</span>
}

/**
 * The health dot: blue within the industry range, red outside it - the old
 * project's colours, glow and pulse. `healthy` passes an answer worked out
 * elsewhere (the Dashboard's own rule) instead of value + benchmark.
 */
export function HealthDot({ value, benchmark, lowerIsBetter, healthy: given }) {
  const healthy = given ?? isHealthy(value, benchmark, lowerIsBetter)
  const label = healthy ? 'Within Industry Benchmark' : 'Outside Industry Benchmark'

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-healthy={healthy}
      className={cn(
        'inline-block size-3.5 shrink-0 animate-pulse rounded-full',
        healthy
          ? 'bg-[#2563eb] shadow-[0_0_5px_#2563eb,0_0_10px_#2563eb,0_0_20px_#2563eb]'
          : 'bg-[#ef4444] shadow-[0_0_5px_#ef4444,0_0_10px_#ef4444,0_0_20px_#ef4444]',
      )}
    />
  )
}

/**
 * A comparison table: `headers`, then one row of `cells` - or `rows`, one per
 * product or buyer, each starting with its name.
 */
export function ComparisonTable({ headers, cells, rows = [cells] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {row.map((cell, index) => (
              <TableCell key={headers[index]} className={index === 0 && rows.length > 1 ? 'capitalize' : undefined}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** One box per product or buyer of an answer keyed by name: its name, then its sentence. */
export function EntryBoxes({ data, children }) {
  return (
    <div className="space-y-2">
      {Object.entries(data || {}).map(([name, item]) => (
        <NoteBox key={name}>
          <h3 className="mb-2 font-semibold text-brand capitalize">{name}</h3>
          {children(item, name)}
        </NoteBox>
      ))}
    </div>
  )
}
