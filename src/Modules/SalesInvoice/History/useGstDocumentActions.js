import { useCallback, useRef, useState } from 'react'

import { toast } from '@/Library/toast'
import { documentPdfFileName, saveDocumentPdf, saveEwayBillPdf } from '@/Services/salesInvoiceService'
import {
  cancelEinvoiceIrn,
  cancelEwayBill,
  einvoiceFromReply,
  generateEinvoiceIrn,
  generateEwayBill,
  readEinvoiceDetails,
} from '@/Services/gstPortalService'

/**
 * E-INVOICE AND E-WAY BILL IN HISTORY - Sales Invoice, Credit Note and Debit
 * Note (GST_DOCUMENT_TYPES):
 *
 *   const gst = useGstDocumentActions({ pdfs, reload })
 *
 * SELECTING AND GENERATING - start('einvoice' | 'ewaybill') puts a box on each
 * eligible row (eligible(row)); generate() then takes the rows ticked one at a
 * time, in the order listed:
 *
 *   E-Invoice   einvoice-generate-irn/ { document_id } -> the invoice PDF made again
 *               with its IRN band (IRN, Ack No., Ack Date, the QR from
 *               qrcode_irn_no_image) -> saved as the document's `file`
 *   E-Way Bill  ewaybill-generate/ { document_id } -> the E-Way Bill PDF made again
 *               with its number and date -> saved as `e_way_bill_pdf`
 *
 * A row is done only once its PDF is saved; the next starts after it. One that
 * fails (the API, or the PDF after it) is counted failed with why - an API
 * success whose PDF then failed says so - and the rest go on. When all are
 * through, the history is read again (`reload`, which keeps the page and the
 * filters). `progress` is { kind, total, done, failed, current, pending, running,
 * results: [{ id, documentNo, ok, message }] }.
 *
 * CANCELLING - cancel(row, 'einvoice' | 'ewaybill'), after the row's confirm:
 * the cancel API, and only once it succeeds, that document's PDF made again
 * stamped CANCELLED and saved (the invoice's `file`, or `e_way_bill_pdf`) -
 * the other document is never touched. Then the history is read again.
 *
 * Eligibility reads e_invoice_details (readEinvoiceDetails): a row is offered
 * for generating while that one is neither generated nor cancelled, and has a
 * document_id. One run at a time - nothing starts while another is running.
 */

/** The history types E-Invoice and E-Way Bill are offered for. */
export const GST_DOCUMENT_TYPES = Object.freeze(['Sales Invoice', 'Credit Note', 'Debit Note'])

const KIND = Object.freeze({
  einvoice: { label: 'E-Invoice', plural: 'E-Invoices' },
  ewaybill: { label: 'E-Way Bill', plural: 'E-Way Bills' },
})

const documentIdOf = (row) => {
  const id = row.source?.document_id
  return id === undefined || id === null || String(id).trim() === '' ? null : id
}

export default function useGstDocumentActions({ pdfs, reload, documentType }) {
  const [mode, setMode] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [progress, setProgress] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const running = useRef(false)

  const eligible = useCallback(
    (row, kind = mode) => {
      if (!kind || documentIdOf(row) === null) return false
      const state = readEinvoiceDetails(row.source)[kind]
      return !state.generated && !state.cancelled
    },
    [mode],
  )

  const start = (kind) => {
    if (running.current) return
    setMode(kind)
    setSelected(new Set())
  }
  const stop = () => {
    if (running.current) return
    setMode(null)
    setSelected(new Set())
  }
  const toggle = (row, on) => {
    if (running.current || !eligible(row)) return
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(String(row.id))
      else next.delete(String(row.id))
      return next
    })
  }
  const toggleMany = (rows, on) => {
    if (running.current) return
    setSelected((current) => {
      const next = new Set(current)
      rows.filter((row) => eligible(row)).forEach((row) => (on ? next.add(String(row.id)) : next.delete(String(row.id))))
      return next
    })
  }

  /** One row through its API, its PDF and its save. -> { ok, message } */
  const processRow = async (kind, row) => {
    const id = documentIdOf(row)
    const name = row.documentNo || `Document ${id}`
    let reply
    try {
      reply = kind === 'einvoice' ? await generateEinvoiceIrn(id) : await generateEwayBill(id)
    } catch (failure) {
      return { ok: false, message: failure.message || `${KIND[kind].label} could not be generated.` }
    }
    const generated = reply?.msg || `${KIND[kind].label} generated.`
    try {
      if (kind === 'einvoice') {
        const einvoice = einvoiceFromReply(reply, readEinvoiceDetails(row.source).einvoice)
        const bytes = await pdfs.makeInvoicePdf(row.source, { einvoice })
        await saveDocumentPdf(id, bytes, documentPdfFileName(documentType, name))
      } else {
        const bytes = await pdfs.makeEwayBillPdf(row.source, { ewaybillNo: reply?.ewaybill_no ?? '', ewaybillDate: reply?.ewaybill_date ?? '' })
        await saveEwayBillPdf(id, bytes, documentPdfFileName('E-Way Bill', name))
      }
    } catch (failure) {
      return { ok: false, message: `${generated} - but its PDF could not be updated: ${failure.message}` }
    }
    return { ok: true, message: generated }
  }

  /** The rows ticked (of `rows`, in their order), one at a time. */
  const generate = async (rows) => {
    if (running.current || !mode) return
    const kind = mode
    const queue = rows.filter((row) => selected.has(String(row.id)) && eligible(row, kind))
    if (queue.length === 0) {
      toast.error(`Select at least one document for ${KIND[kind].label}.`)
      return
    }
    if (pdfs.status !== 'ready') {
      toast.error(pdfs.status === 'failed' ? 'The ledgers, products or banks could not be loaded, so the PDFs cannot be made.' : 'The ledgers, products and banks are still loading - try again in a moment.')
      return
    }
    running.current = true
    const results = []
    const report = (current) =>
      setProgress({
        kind,
        total: queue.length,
        done: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        current,
        pending: queue.length - results.length - (current ? 1 : 0),
        running: Boolean(current),
        results: [...results],
      })
    try {
      for (const row of queue) {
        report(row.documentNo || String(row.id))
        const result = await processRow(kind, row)
        results.push({ id: String(row.id), documentNo: row.documentNo, ...result })
        if (!result.ok) toast.error(`${row.documentNo || 'Document'}: ${result.message}`)
      }
      report(null)
      const done = results.filter((result) => result.ok).length
      const failed = results.length - done
      if (failed === 0) toast.success(`${done} ${done === 1 ? KIND[kind].label : KIND[kind].plural} generated and saved.`)
      else toast.error(`${done} of ${results.length} ${KIND[kind].plural} completed; ${failed} failed.`)
      setMode(null)
      setSelected(new Set())
    } finally {
      running.current = false
      reload()
    }
  }

  /** Cancel E-Invoice / Cancel E-Way Bill on one row - after its confirm. */
  const cancel = async (row, kind) => {
    if (running.current || cancelling) return
    const id = documentIdOf(row)
    if (id === null) return
    if (pdfs.status !== 'ready') {
      toast.error('The ledgers, products and banks are still loading - try again in a moment.')
      return
    }
    const name = row.documentNo || `Document ${id}`
    running.current = true
    setCancelling(`${kind}:${row.id}`)
    try {
      let reply
      try {
        reply = kind === 'einvoice' ? await cancelEinvoiceIrn(id) : await cancelEwayBill(id)
      } catch (failure) {
        toast.error(failure.message || `${KIND[kind].label} could not be cancelled.`)
        return
      }
      const cancelled = reply?.msg || `${KIND[kind].label} cancelled.`
      try {
        const details = readEinvoiceDetails(row.source)
        if (kind === 'einvoice') {
          const bytes = await pdfs.makeInvoicePdf(row.source, { einvoice: details.einvoice.irn ? details.einvoice : null, cancelled: true })
          await saveDocumentPdf(id, bytes, documentPdfFileName(documentType, name))
        } else {
          const bytes = await pdfs.makeEwayBillPdf(row.source, { ewaybillNo: details.ewaybill.number, ewaybillDate: details.ewaybill.date, cancelled: true })
          await saveEwayBillPdf(id, bytes, documentPdfFileName('E-Way Bill', name))
        }
        toast.success(`${cancelled} The ${kind === 'einvoice' ? 'invoice' : 'E-Way Bill'} PDF is stamped CANCELLED.`)
      } catch (failure) {
        // The cancel stands on the portal - only the PDF is behind.
        toast.error(`${cancelled} - but the CANCELLED PDF could not be saved: ${failure.message}`)
      }
      reload()
    } finally {
      running.current = false
      setCancelling(null)
    }
  }

  return {
    mode,
    selected,
    progress,
    busy: Boolean(progress?.running) || cancelling !== null,
    cancelling,
    eligible,
    start,
    stop,
    toggle,
    toggleMany,
    generate,
    cancel,
    dismissProgress: () => !running.current && setProgress(null),
  }
}
