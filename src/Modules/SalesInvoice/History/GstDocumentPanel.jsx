import { CheckCircle2, FileCheck2, Loader2, Truck, X, XCircle } from 'lucide-react'

import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'

const LABEL = { einvoice: 'E-Invoice', ewaybill: 'E-Way Bill' }

/**
 * History's E-Invoice / E-Way Bill buttons (useGstDocumentActions): the two
 * actions; once one is pressed, its Generate button (with how many are
 * ticked) and Cancel in their place. `size` is the buttons' - the size of the
 * buttons they stand beside.
 */
export function GstToolbarActions({ gst, rows, disabled, size }) {
  if (!gst.mode) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="E-Invoice and E-Way Bill">
        <Button type="button" variant="outline" size={size} icon={FileCheck2} disabled={disabled || gst.busy} onClick={() => gst.start('einvoice')}>
          E-Invoice
        </Button>
        <Button type="button" variant="outline" size={size} icon={Truck} disabled={disabled || gst.busy} onClick={() => gst.start('ewaybill')}>
          E-Way Bill
        </Button>
      </div>
    )
  }
  const running = Boolean(gst.progress?.running)
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${LABEL[gst.mode]} selection`}>
      <Button
        type="button"
        size={size}
        icon={gst.mode === 'einvoice' ? FileCheck2 : Truck}
        loading={running}
        disabled={running || gst.selected.size === 0}
        onClick={() => gst.generate(rows)}
      >
        {running ? 'Generating...' : `${LABEL[gst.mode]} Generate${gst.selected.size ? ` (${gst.selected.size})` : ''}`}
      </Button>
      <Button type="button" variant="ghost" size={size} icon={X} disabled={running} onClick={gst.stop}>
        Cancel
      </Button>
    </div>
  )
}

const Count = ({ label, value, tone }) => (
  <div className="min-w-20 rounded-md border border-border bg-card px-2.5 py-1.5">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold tabular-nums ${tone ?? 'text-foreground'}`} data-testid={`gst-progress-${label.toLowerCase()}`}>
      {value}
    </p>
  </div>
)

/** The progress of a run - total, completed, processing, pending, failed - and each document's outcome. */
export function GstProgressPanel({ gst }) {
  const progress = gst.progress
  if (!progress) return null
  const label = LABEL[progress.kind]
  return (
    <Card className="gap-0 border-border/70 py-3 shadow-sm" aria-label={`${label} progress`} aria-live="polite">
      <CardContent className="space-y-2.5 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            {progress.running ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {progress.running ? `Generating ${label} - ${progress.current}` : `${label} generation finished`}
          </p>
          {progress.running ? null : (
            <Button type="button" variant="ghost" size="sm" icon={X} onClick={gst.dismissProgress}>
              Dismiss
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Count label="Total" value={progress.total} />
          <Count label="Completed" value={progress.done} tone="text-emerald-700" />
          <Count label="Processing" value={progress.running ? 1 : 0} tone="text-brand" />
          <Count label="Pending" value={progress.pending} />
          <Count label="Failed" value={progress.failed} tone={progress.failed ? 'text-destructive' : undefined} />
        </div>
        {progress.results.length ? (
          <ul className="space-y-1 text-xs" data-testid="gst-progress-results">
            {progress.results.map((result) => (
              <li key={result.id} className="flex items-start gap-1.5">
                {result.ok ? (
                  <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-px size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <span>
                  <span className="font-semibold">{result.documentNo || result.id}</span> - {result.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
