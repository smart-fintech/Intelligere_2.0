import { AlertTriangle, Check, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react'

import { ProgressBar } from '@/Components/Common/Loader'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/Components/ui/table'
import { cn } from '@/Library/utils'

/** How each status the backend sends is shown - its own word, never one worked out here. */
const STATUS = {
  success: { label: 'Success', icon: CheckCircle2, tone: 'text-emerald-700' },
  failed: { label: 'Failed', icon: XCircle, tone: 'text-destructive' },
  processing: { label: 'Processing', icon: Loader2, tone: 'text-brand', spin: true },
  pending: { label: 'Pending', icon: Clock, tone: 'text-amber-700' },
}

const Count = ({ label, value, tone }) => (
  <div className="min-w-20 rounded-md border border-border bg-card px-2.5 py-1.5">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold tabular-nums ${tone ?? 'text-foreground'}`} data-testid={`ai-progress-${label.toLowerCase()}`}>
      {value}
    </p>
  </div>
)

function StatusText({ status }) {
  const shown = STATUS[status] ?? { label: status, icon: Clock, tone: 'text-muted-foreground' }
  const Icon = shown.icon
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', shown.tone)}>
      <Icon className={cn('size-3.5 shrink-0', shown.spin && 'animate-spin')} aria-hidden="true" />
      {shown.label}
    </span>
  )
}

/**
 * The finished upload: the backend's own message, the real counts beside it
 * (some failed - it never reads as all done), and OK, which marks the upload
 * as seen (ai.acknowledge) - sent only from this button.
 */
function Finished({ ai, progress }) {
  const allFailed = progress.success === 0
  const someFailed = progress.failed > 0
  const Icon = allFailed ? XCircle : someFailed ? AlertTriangle : CheckCircle2
  const tone = allFailed ? 'text-destructive' : someFailed ? 'text-amber-700' : 'text-emerald-700'
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5"
      role={allFailed || someFailed ? 'alert' : 'status'}
      data-testid="ai-progress-finished"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={cn('mt-0.5 size-5 shrink-0', tone)} aria-hidden="true" />
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', tone)}>
            {progress.msg || (allFailed ? 'No voucher was created.' : 'Processing finished.')}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="ai-progress-summary">
            {progress.success} of {progress.total} processed successfully
            {someFailed ? `, ${progress.failed} failed - see the reasons below.` : '.'}
          </p>
        </div>
      </div>
      <Button type="button" icon={Check} loading={ai.acknowledging} disabled={ai.acknowledging} onClick={ai.acknowledge}>
        OK
      </Button>
    </div>
  )
}

/** Refresh - reads the progress again (never by itself); disabled while a read is on its way. */
export function RefreshButton({ ai }) {
  return (
    <Button type="button" variant="outline" size="sm" icon={RefreshCw} loading={ai.refreshing} disabled={ai.refreshing || ai.acknowledging} onClick={ai.refresh}>
      Refresh
    </Button>
  )
}

/**
 * AI Voucher's progress, exactly as invoice/pdf-progress/ last reported it:
 * total, success, failed, processing and pending, the percentage, and each file
 * with its invoice number, status and message. Nothing is asked for by itself -
 * Refresh reads it again.
 *
 *   ai             useAiVoucherProcessing(...)
 *   documentType   what the files are read as
 */
export default function AiVoucherProgress({ ai, documentType }) {
  const progress = ai.progress
  const finished = ai.phase === 'finished' && progress
  return (
    <Card className="gap-0 border-border/70 py-3 shadow-sm" aria-label="AI Voucher progress" aria-live="polite">
      <CardContent className="space-y-3 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            {finished ? null : <Clock className="size-4" aria-hidden="true" />}
            {finished
              ? `AI Voucher - ${documentType} processing finished`
              : `Processing ${progress ? progress.total : ai.sent} file${(progress ? progress.total : ai.sent) === 1 ? '' : 's'} - ${documentType}`}
          </p>
          <div className="flex items-center gap-3">
            {progress ? (
              <span className="text-base font-semibold text-brand tabular-nums" data-testid="ai-progress-percentage">
                {progress.percentage}%
              </span>
            ) : null}
            <RefreshButton ai={ai} />
          </div>
        </div>

        {finished ? <Finished ai={ai} progress={progress} /> : null}

        {finished ? null : (
          <p className="text-xs text-muted-foreground" role="status" data-testid="ai-progress-hint">
            {progress
              ? 'The files are still being processed. Click Refresh to check the latest progress.'
              : 'Processing started in the background. Click Refresh to check its progress.'}
          </p>
        )}

        {progress ? <ProgressBar percent={progress.percentage} /> : null}

        {progress ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Count label="Total" value={progress.total} />
              <Count label="Success" value={progress.success} tone="text-emerald-700" />
              <Count label="Failed" value={progress.failed} tone={progress.failed ? 'text-destructive' : undefined} />
              <Count label="Processing" value={progress.processing} tone="text-brand" />
              <Count label="Pending" value={progress.pending} />
            </div>

            {progress.invoices.length ? (
              <Table containerClassName="max-h-[50vh] overflow-y-auto rounded-md border border-border" aria-label="Files">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead width={60}>S.No.</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead width={160}>Invoice No.</TableHead>
                    <TableHead width={130}>Status</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.invoices.map((row, index) => (
                    <TableRow key={row.key} data-status={row.status}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell wrap>{row.fileName || '--'}</TableCell>
                      <TableCell>{row.invoiceNumber || '--'}</TableCell>
                      <TableCell>
                        <StatusText status={row.status} />
                      </TableCell>
                      <TableCell wrap className={row.status === 'failed' ? 'text-destructive' : undefined}>
                        {row.message || '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
