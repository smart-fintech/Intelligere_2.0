import { AlertTriangle, CheckCircle2, FileCheck2, FileUp, KeyRound, Loader2, Truck, X, XCircle } from 'lucide-react'

import { InlineAlert } from '@/Components/Common/DataList'
import { Field } from '@/Components/Common/FormFields'
import { GstPortalAuthDialogs } from '@/Components/Common/GstPortalAuthDialogs'
import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { Card, CardContent } from '@/Components/ui/card'

const LABEL = { einvoice: 'E-Invoice', ewaybill: 'E-Way Bill', gstr1: 'GSTR-1' }
const ICON = { einvoice: FileCheck2, ewaybill: Truck, gstr1: FileUp }

/**
 * History's E-Invoice / E-Way Bill buttons - and GSTR-1, on Sales Invoice
 * (useGstDocumentActions): the actions; once one is pressed, its Generate (or
 * File) button, with how many are ticked, and Cancel in their place. `size` is
 * the buttons' - the size of the buttons they stand beside.
 */
export function GstToolbarActions({ gst, rows, disabled, size }) {
  if (!gst.mode) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label="E-Invoice, E-Way Bill and GSTR-1">
        <Button type="button" variant="outline" size={size} icon={FileCheck2} disabled={disabled || gst.busy} onClick={() => gst.start('einvoice')}>
          E-Invoice
        </Button>
        <Button type="button" variant="outline" size={size} icon={Truck} disabled={disabled || gst.busy} onClick={() => gst.start('ewaybill')}>
          E-Way Bill
        </Button>
        {gst.offersGstr1 ? (
          <Button type="button" variant="outline" size={size} icon={FileUp} disabled={disabled || gst.busy} onClick={() => gst.start('gstr1')}>
            GSTR-1
          </Button>
        ) : null}
      </div>
    )
  }
  const running = Boolean(gst.progress?.running) || (gst.mode === 'gstr1' && gst.busy)
  const count = gst.selected.size ? ` (${gst.selected.size})` : ''
  const idleLabel = gst.mode === 'gstr1' ? `File GSTR-1${count}` : `${LABEL[gst.mode]} Generate${count}`
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${LABEL[gst.mode]} selection`}>
      <Button
        type="button"
        size={size}
        icon={ICON[gst.mode]}
        loading={running}
        disabled={running || gst.selected.size === 0}
        onClick={() => gst.generate(rows)}
      >
        {running ? (gst.mode === 'gstr1' ? 'Filing GSTR-1...' : 'Generating...') : idleLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} icon={X} disabled={running} onClick={gst.stop}>
        Cancel
      </Button>
    </div>
  )
}

const EVC_FORM = 'gstr1-evc-form'

/**
 * GSTR-1 filing's dialogs and outcome (useGstr1Filing, `gst.gstr1`): the
 * portal sign-in dialogs, the EVC OTP dialog - File GSTR-1 is the only thing
 * that files - and, once over, the acknowledgement number or the warning that
 * the filing's status is unknown, kept until dismissed.
 */
export function Gstr1Filing({ filing }) {
  const { evc, outcome } = filing
  return (
    <>
      <GstPortalAuthDialogs portal={filing.portal} />

      <Modal
        open={filing.evcOpen}
        onOpenChange={(next) => !next && filing.cancelEvc()}
        size="sm"
        title="File GSTR-1"
        description="Filing GSTR-1 cannot be undone. Enter the EVC OTP the GST portal sent to the registered mobile number."
        closeOnBackdropClick={false}
        footer={
          <>
            <Button
              type="button"
              variant="link"
              className="mr-auto px-0"
              disabled={filing.submitting}
              onClick={filing.resendEvc}
            >
              Resend EVC OTP
            </Button>
            <Button type="button" variant="ghost" disabled={filing.submitting} onClick={filing.cancelEvc}>
              Cancel
            </Button>
            <Button type="submit" form={EVC_FORM} loading={filing.submitting} disabled={!filing.evcOtp.trim()}>
              File GSTR-1
            </Button>
          </>
        }
      >
        <form id={EVC_FORM} noValidate onSubmit={filing.submitEvc} className="space-y-4">
          {evc ? (
            <p className="text-sm text-muted-foreground">
              Return period <span className="font-medium text-primary">{evc.retPeriod.replace(/^(\d{2})(\d{4})$/, '$1/$2')}</span> -{' '}
              {evc.invoiceIds.length} {evc.invoiceIds.length === 1 ? 'invoice' : 'invoices'}
            </p>
          ) : null}
          <Field
            id="gstr1-evc-otp"
            label="EVC OTP"
            required
            icon={KeyRound}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={filing.evcOtp}
            disabled={filing.submitting}
            onChange={(event) => filing.setEvcOtp(event.target.value)}
          />
          {filing.evcError ? <InlineAlert>{filing.evcError}</InlineAlert> : null}
        </form>
      </Modal>

      {outcome ? (
        <Card className="gap-0 border-border/70 py-3 shadow-sm" aria-live="polite" data-testid="gstr1-outcome">
          <CardContent className="flex flex-wrap items-start justify-between gap-2 px-3">
            <p className="flex items-start gap-2 text-sm">
              {outcome.kind === 'filed' ? (
                <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-px size-4 shrink-0 text-destructive" aria-hidden="true" />
              )}
              <span className={outcome.kind === 'filed' ? 'text-foreground' : 'font-semibold text-destructive'}>
                {outcome.message}
                {outcome.ackNo ? (
                  <>
                    {' '}
                    Acknowledgement No. <span className="font-semibold tabular-nums">{outcome.ackNo}</span>
                  </>
                ) : null}
              </span>
            </p>
            <Button type="button" variant="ghost" size="sm" icon={X} onClick={filing.dismissOutcome}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
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
