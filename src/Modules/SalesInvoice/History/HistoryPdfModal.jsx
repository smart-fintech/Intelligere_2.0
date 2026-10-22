import { useEffect, useState } from 'react'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-react'

import { Modal } from '@/Components/Common/Modal'
import { Button } from '@/Components/ui/button'
import { formatDate } from '@/Utils/date'

/**
 * A history row's saved PDF (its doc_pdf - readHistoryRow's `pdfUrl`), in a
 * modal. Nothing is generated and no API is called: the file the history
 * names is the file shown.
 *
 * It is fetched first, the way Download Excel's file is (downloadFileFromUrl),
 * so a file that is not there says so instead of leaving an empty frame:
 *
 *   found              shown from a blob URL in an iframe - the voucher
 *                      preview's way of showing a PDF
 *   404 / not a PDF    "The PDF could not be loaded", with why
 *   fetch blocked      (the file host allows no cross-origin read) - the URL
 *                      itself goes in the iframe, as the voucher preview does,
 *                      with Open in new tab beside it
 *
 *   row        readHistoryRow(...) of the document - null when closed
 *   onClose()
 */
function PdfFrame({ url, title }) {
  // { status: 'loading' | 'ready' | 'direct' | 'failed', src, reason }
  const [state, setState] = useState({ status: 'loading', src: null, reason: '' })

  useEffect(() => {
    const controller = new AbortController()
    let blobUrl = null
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The server answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`)
        const blob = await response.blob()
        // A page in place of the file (a missing file sent to the app's own index) is not the PDF.
        if (/html|json/i.test(blob.type)) throw new Error('The file at this link is not a PDF.')
        blobUrl = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }))
        setState({ status: 'ready', src: blobUrl, reason: '' })
      })
      .catch((failure) => {
        if (controller.signal.aborted) return
        // A TypeError is the fetch itself refused (CORS, network) - the browser may still show the file.
        if (failure instanceof TypeError) setState({ status: 'direct', src: url, reason: '' })
        else setState({ status: 'failed', src: null, reason: failure.message })
      })
    return () => {
      controller.abort()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [url])

  if (state.status === 'loading') {
    return (
      <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading the PDF...
      </div>
    )
  }
  if (state.status === 'failed') {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm" role="alert" data-testid="history-pdf-error">
        <FileWarning className="size-8 text-destructive/70" aria-hidden="true" />
        <p className="font-semibold text-destructive">The PDF could not be loaded.</p>
        <p className="text-muted-foreground">{state.reason}</p>
      </div>
    )
  }
  return <iframe title={title} src={state.src} className="h-[70vh] w-full rounded-md border border-border bg-muted/30" />
}

export default function HistoryPdfModal({ row, onClose }) {
  const name = row?.documentNo || 'Document'
  const url = row?.pdfUrl ?? null

  return (
    <Modal
      open={Boolean(row)}
      onOpenChange={(open) => !open && onClose()}
      title={`${name} - PDF`}
      description={row ? [row.buyerName, row.documentDate ? formatDate(row.documentDate) : ''].filter(Boolean).join(' - ') || undefined : undefined}
      size="xxl"
      autoFocus={false}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {url ? (
            <Button type="button" variant="outline" icon={ExternalLink} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
              Open in new tab
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {!row ? null : url ? (
        // Keyed by the URL: another row's PDF starts from its own loading state.
        <PdfFrame key={url} url={url} title={`${name} PDF`} />
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
