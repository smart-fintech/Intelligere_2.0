import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, FileText, Inbox, X } from 'lucide-react'

import { ListSkeleton, RetryButton, StateMessage } from '@/Components/Common/DataList'
import { Button } from '@/Components/ui/button'
import { QUERY } from '@/Constants/queryKeys'
import { invalidateQueries } from '@/Library/queryCache'
import { toast } from '@/Library/toast'
import { cn } from '@/Library/utils'
import { PdfFrame } from '@/Modules/SalesInvoice/History/HistoryPdfModal'
import { fileUrlOf } from '@/Services/salesInvoiceService'
import { getSharedInvoices, respondToSharedInvoice } from '@/Services/invoiceSharingService'

/**
 * ADD VOUCHER (Purchase Invoice) - the documents other companies have shared
 * with this one (POST invoice/xy-invoice/ { company_id }), each to be accepted
 * (a Purchase Invoice voucher is made of it) or declined:
 *
 *   left    the shared documents - number, date, type
 *   right   the one chosen: its PDF (doc_pdf), its details, "Are you sure ...?"
 *           and Accept / Decline - PUT invoice/xy-invoice/ { company_id,
 *           document_no, accepted, document_id }, once however often pressed
 *
 * Each record is kept by its own `id`; `document_id` is the shared document's
 * and is what the answer names. After an answer the server's message is shown,
 * the list is asked for again, and the company's vouchers are read again
 * (an accepted one is now a Purchase Invoice voucher).
 *
 *   company   the active company's record
 */
const text = (value) => (value === null || value === undefined ? '' : String(value).trim())
const keyOf = (record) => String(record.id ?? `${record.document_id}-${record.document_no}`)

export default function SharedInvoices({ company }) {
  const companyId = company.company_id
  const [state, setState] = useState({ status: 'loading', rows: [], error: null })
  const [attempt, setAttempt] = useState(0)
  const [chosenKey, setChosenKey] = useState(null)
  const [answering, setAnswering] = useState(null)
  const busy = useRef(false)

  useEffect(() => {
    let current = true
    getSharedInvoices(companyId)
      .then((rows) => current && setState({ status: 'ready', rows: rows.filter((row) => row && typeof row === 'object'), error: null }))
      .catch((failure) => current && setState((previous) => ({ status: 'failed', rows: previous.rows, error: failure.message })))
    return () => {
      current = false
    }
  }, [companyId, attempt])

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setAttempt((count) => count + 1)
  }, [])

  const chosen = state.rows.find((row) => keyOf(row) === chosenKey) ?? null

  const answer = async (accepted) => {
    if (busy.current || !chosen) return
    busy.current = true
    setAnswering(accepted ? 'accept' : 'decline')
    try {
      const reply = await respondToSharedInvoice({ companyId, documentNo: chosen.document_no, documentId: chosen.document_id, accepted })
      toast.success(reply?.msg || (accepted ? 'Invoice accepted.' : 'Invoice declined.'))
      setChosenKey(null)
      reload()
      if (accepted) invalidateQueries(QUERY.TALLY_VOUCHERS, { whose: companyId, refetchActive: true })
    } catch (failure) {
      toast.error(failure.message || 'The answer could not be sent.')
    } finally {
      busy.current = false
      setAnswering(null)
    }
  }

  if (state.status === 'failed' && state.rows.length === 0) {
    return (
      <StateMessage icon={AlertCircle} tone="error" title="Could not load the shared invoices" action={<RetryButton onClick={reload} />}>
        {state.error}
      </StateMessage>
    )
  }
  if (state.status === 'loading' && state.rows.length === 0) return <ListSkeleton rows={4} />
  if (state.rows.length === 0) {
    return (
      <StateMessage icon={Inbox} title="No shared invoices">
        No company has shared an invoice with {company.comp_name || 'this company'}.
      </StateMessage>
    )
  }

  const pdfUrl = chosen ? fileUrlOf(chosen.doc_pdf) : null
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
      <ul className={cn('space-y-1.5', state.status === 'loading' && 'opacity-60')} aria-label="Shared invoices">
        {state.rows.map((row) => {
          const selected = keyOf(row) === chosenKey
          return (
            <li key={keyOf(row)}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={answering !== null}
                onClick={() => setChosenKey(keyOf(row))}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  selected ? 'border-brand bg-brand-soft' : 'border-border bg-card hover:border-brand/50',
                )}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-brand">{text(row.document_no) || '(no number)'}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[text(row.document_type), text(row.document_date)].filter(Boolean).join(' - ')}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="min-w-0 rounded-lg border border-border bg-card p-3">
        {!chosen ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <FileText className="size-8 text-brand/40" aria-hidden="true" />
            <p>Select a shared invoice to review it.</p>
          </div>
        ) : (
          <div className="space-y-3" aria-label={`Shared invoice ${text(chosen.document_no)}`}>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              {[
                ['Document No.', text(chosen.document_no)],
                ['Document Date', text(chosen.document_date)],
                ['Document Type', text(chosen.document_type)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold">{value || '--'}</dd>
                </div>
              ))}
            </dl>
            {pdfUrl ? (
              <PdfFrame key={pdfUrl} url={pdfUrl} title={`${text(chosen.document_no)} PDF`} heightClass="h-[60vh]" />
            ) : (
              <div className="flex h-[30vh] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground" role="alert">
                No PDF was shared with this invoice.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-sm">Are you sure you want to create a Purchase Invoice voucher for this invoice?</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" icon={X} loading={answering === 'decline'} disabled={answering !== null} onClick={() => answer(false)}>
                  Decline
                </Button>
                <Button type="button" icon={Check} loading={answering === 'accept'} disabled={answering !== null} onClick={() => answer(true)}>
                  Accept
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
