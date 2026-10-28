import { useState } from 'react'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { ViewSwitch } from '@/Components/Common/ViewSwitch'
import { Button } from '@/Components/ui/button'
import { cn } from '@/Library/utils'
import { formatDate } from '@/Utils/date'

/**
 * A saved PDF, shown from its own URL - the URL itself is the iframe's
 * source, the way the browser's PDF viewer loads a file: no fetch, no blob, no
 * second request (a fetch first was what met the file host's CORS rules, and
 * what a remount cancelled). "Loading the PDF..." shows until the frame has
 * loaded. Callers key it by the URL, so another file starts from loading.
 *
 *   url, title
 *   heightClass   the frame's height - 'h-full' to fill a sized box
 *   hidden        kept loaded but not shown (another PDF of the same document is)
 */
export function PdfFrame({ url, title, heightClass = 'h-[70vh]', hidden = false }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={cn('relative w-full', heightClass)} hidden={hidden}>
      {loaded ? null : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the PDF...
        </div>
      )}
      <iframe title={title} src={url} onLoad={() => setLoaded(true)} className="size-full rounded-md border border-border bg-muted/30" />
    </div>
  )
}

const LABELS = { invoice: 'Invoice PDF', ewayBill: 'E-Way Bill PDF' }

/**
 * A History row's saved PDFs, in one modal. Nothing is generated and no API
 * is called: the files the history names are the files shown.
 *
 *   the invoice's PDF (doc_pdf - readHistoryRow's `pdfUrl`), and with
 *   `ewayBill` (Sales Invoice, Credit Note, Debit Note) its E-Way Bill PDF
 *   (e_way_bill_pdf - `ewayBillPdfUrl`) when it has one:
 *     both    Invoice PDF / E-Way Bill PDF to choose from, Invoice PDF first;
 *             each file is loaded the first time it is chosen and then kept,
 *             so switching back and forth loads nothing again
 *     one     that one, with nothing to choose
 *     none    "No PDF is saved for this document" - no empty viewer
 *
 * The viewer fills the modal's height and scrolls inside itself; the modal
 * has no scrollbar of its own.
 *
 *   row        readHistoryRow(...) of the document - null when closed
 *   ewayBill   its E-Way Bill PDF is offered too
 *   onClose()
 */
export default function HistoryPdfModal({ row, ewayBill = false, onClose }) {
  const name = row?.documentNo || 'Document'
  const files = row
    ? [
        ['invoice', row.pdfUrl],
        ['ewayBill', ewayBill ? row.ewayBillPdfUrl : null],
      ].filter(([, url]) => url)
    : []

  // { row, kind, opened } - the file shown, and the files loaded so far. Another row starts afresh.
  const [view, setView] = useState({ row: null, kind: null, opened: [] })
  if (view.row !== row) setView({ row, kind: files[0]?.[0] ?? null, opened: files[0] ? [files[0][0]] : [] })
  const current = files.find(([kind]) => kind === view.kind) ?? files[0] ?? null
  const choose = (kind) => kind && setView((shown) => ({ ...shown, kind, opened: shown.opened.includes(kind) ? shown.opened : [...shown.opened, kind] }))

  return (
    <Modal
      open={Boolean(row)}
      onOpenChange={(open) => !open && onClose()}
      title={`${name} - ${current?.[0] === 'ewayBill' ? 'E-Way Bill PDF' : 'PDF'}`}
      description={row ? [row.buyerName, row.documentDate ? formatDate(row.documentDate) : ''].filter(Boolean).join(' - ') || undefined : undefined}
      size="xxl"
      autoFocus={false}
      // The viewer scrolls; the modal does not - it takes the screen's height and the viewer the rest of it.
      scrollable={false}
      className={current ? 'h-[calc(100dvh-4rem)]' : undefined}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {current ? (
            <Button type="button" variant="outline" icon={ExternalLink} onClick={() => window.open(current[1], '_blank', 'noopener,noreferrer')}>
              Open in new tab
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {!row ? null : current ? (
        <div className="flex h-full min-h-0 flex-col gap-3">
          {files.length > 1 ? (
            <ViewSwitch
              options={files.map(([kind]) => ({ value: kind, label: LABELS[kind] }))}
              value={current[0]}
              onValueChange={choose}
              label={`PDF of ${name}`}
              idPrefix="history-pdf"
              className="w-fit justify-start"
            />
          ) : null}
          <div className="min-h-0 flex-1">
            {files
              .filter(([kind]) => view.opened.includes(kind) || kind === current[0])
              .map(([kind, url]) => (
                // Keyed by the URL: another file starts from its own loading state.
                <PdfFrame key={`${kind}:${url}`} url={url} title={`${name} ${LABELS[kind]}`} heightClass="h-full" hidden={kind !== current[0]} />
              ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm" role="alert" data-testid="history-pdf-missing">
          <FileWarning className="size-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="font-semibold">No PDF is saved for this document.</p>
          <p className="text-muted-foreground">Its PDF was not uploaded, so there is nothing to preview.</p>
        </div>
      )}
    </Modal>
  )
}
