import { useEffect, useRef } from 'react'

import { MeasureHost } from '@/Modules/SalesInvoice/Document/InvoiceTemplate'
import useInvoiceLayout from '@/Modules/SalesInvoice/Document/useInvoiceLayout'

/**
 * One invoice PDF made from History (useHistoryDocumentPdf): its model is
 * measured off screen, and once the layout is this model's the PDF is drawn
 * to it - `job.resolve(bytes)`, or `job.reject(error)`.
 */
export default function HistoryPdfJob({ job }) {
  const { register, layout } = useInvoiceLayout(job.model, true)
  const started = useRef(false)
  useEffect(() => {
    if (started.current || layout?.model !== job.model) return
    started.current = true
    import('@/Modules/SalesInvoice/Document/invoicePdf')
      .then(({ createInvoicePdf }) => createInvoicePdf({ model: job.model, layout }))
      .then(job.resolve, job.reject)
  }, [layout, job])
  return <MeasureHost model={job.model} register={register} />
}

