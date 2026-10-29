import { useCallback, useRef, useState } from 'react'

import { toEwayBillModel } from '@/Modules/SalesInvoice/Document/ewayBillModel'
import { toInvoiceModel } from '@/Modules/SalesInvoice/Document/invoiceModel'
import { readFileDataUrl } from '@/Modules/SalesInvoice/Document/useFileDataUrl'
import { formFromSavedDocument } from '@/Modules/SalesInvoice/documentPrefill'
import { applicableForm, createInvoiceForm, documentProfile, gstByRate, invoiceFigures } from '@/Modules/SalesInvoice/salesInvoiceForm'
import useDocumentMappings from '@/Modules/SalesInvoice/useDocumentMappings'
import useInvoiceReferenceData from '@/Modules/SalesInvoice/useInvoiceReferenceData'
import HistoryPdfJob from '@/Modules/SalesInvoice/History/HistoryPdfJob'
import { getCountries, getStates } from '@/Services/locationService'
import { MAPPING_DOCUMENT_TYPE } from '@/Services/salesInvoiceService'
import { resolveGstLedgers } from '@/Utils/gstLedgers'
import '@/Modules/SalesInvoice/Document/invoiceSheet.css'

/**
 * A SAVED DOCUMENT'S PDFs, MADE AGAIN FROM HISTORY - for the E-Invoice and
 * E-Way Bill actions, which change what is printed on a document already
 * saved (its IRN and QR, its e-way bill number, a CANCELLED stamp):
 *
 *   const pdfs = useHistoryDocumentPdf(company)
 *   {pdfs.host}                                   mounted once, out of view
 *   pdfs.status                                   'loading' | 'ready' | 'failed'
 *   await pdfs.makeInvoicePdf(record, { einvoice, cancelled })     -> PDF bytes
 *   await pdfs.makeEwayBillPdf(record, { ewaybillNo, ewaybillDate, cancelled }) -> PDF bytes
 *
 * The history row is put into a form exactly as Edit does (formFromSavedDocument),
 * and the invoice model is built from it the way the workspace builds it
 * (applicableForm, invoiceFigures, the GST ledgers resolved, toInvoiceModel) -
 * so the PDF is the existing one, with only the IRN band or the stamp added.
 * The invoice is measured off screen (MeasureHost, useInvoiceLayout) and drawn
 * to that layout (createInvoicePdf); the e-way bill needs no layout. One PDF
 * at a time - a second waits for the first.
 *
 * Sales documents only (Sales Invoice, Credit Note, Debit Note): the company
 * is the seller, the ledger the buyer.
 */

const SALE = Object.freeze({ company: 'seller', ledger: 'buyer' })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (number) => String(number).padStart(2, '0')

/** "Printed on 23-Oct-26 at 11:35" - the e-Invoice band's strip. */
const printedOn = (now = new Date()) =>
  `Printed on ${pad(now.getDate())}-${MONTHS[now.getMonth()]}-${String(now.getFullYear()).slice(-2)} at ${pad(now.getHours())}:${pad(now.getMinutes())}`

export default function useHistoryDocumentPdf(company) {
  const companyId = company.company_id
  const { ledgers, banks, countries, products } = useInvoiceReferenceData(companyId)
  const mappings = useDocumentMappings(companyId, MAPPING_DOCUMENT_TYPE.SALES)
  const [job, setJob] = useState(null)
  const queue = useRef(Promise.resolve())
  const jobCount = useRef(0)

  const statuses = [ledgers.status, banks.status, products.status]
  const status = statuses.includes('failed') || mappings.status === 'failed'
    ? 'failed'
    : statuses.some((value) => value === 'idle' || value === 'loading') || mappings.status !== 'ready'
      ? 'loading'
      : 'ready'

  /** The record's invoice model, as the workspace would print it. */
  const modelOf = useCallback(
    async (record) => {
      if (status !== 'ready') throw new Error('The ledgers, products and banks are still loading - try again in a moment.')
      const form = formFromSavedDocument(record, {
        createForm: createInvoiceForm,
        company,
        parties: SALE,
        ledgers,
        products: products.list,
        banks: banks.list,
        countries: { countryNames: getCountries(countries.data), stateNamesOf: (country) => getStates(countries.data, country) },
      })
      const applicable = applicableForm(form)
      const figures = invoiceFigures(applicable)
      const gst = documentProfile(form).gst ? gstByRate(figures) : []
      const bank = banks.list.find((entry) => String(entry.id) === String(applicable.document.bankId)) ?? null
      const paymentQr = await readFileDataUrl(applicable.document.paymentQr)
      return {
        form,
        model: toInvoiceModel({
          form: applicable,
          figures,
          gst: resolveGstLedgers(gst, { ledgerMapping: mappings.ledgerMapping, ledgers: ledgers.named }),
          productsByKey: products.byKey,
          ledgersById: ledgers.byId,
          bank,
          images: { logo: null, signature: null, paymentQr },
        }),
      }
    },
    [status, company, ledgers, products, banks, countries.data, mappings.ledgerMapping],
  )

  /** One at a time: each PDF starts once the one before it has finished. */
  const enqueue = useCallback((work) => {
    const run = queue.current.then(work, work)
    queue.current = run.catch(() => {})
    return run
  }, [])

  /**
   * The invoice PDF again, with its IRN band (`einvoice`: { irn, ackNo, ackDate,
   * qr } - qr an image URL) and / or stamped CANCELLED.
   */
  const makeInvoicePdf = useCallback(
    (record, { einvoice = null, cancelled = false } = {}) =>
      enqueue(async () => {
        const { model } = await modelOf(record)
        const qr = einvoice?.qr ? await readFileDataUrl(einvoice.qr) : null
        if (einvoice?.qr && !qr) throw new Error('The IRN QR code image could not be loaded.')
        const printable = { ...model, ...(einvoice ? { einvoice: { ...einvoice, qr }, printedOn: printedOn() } : null), cancelled }
        try {
          return await new Promise((resolve, reject) => {
            jobCount.current += 1
            setJob({ id: jobCount.current, model: printable, resolve, reject })
          })
        } finally {
          setJob(null)
        }
      }),
    [enqueue, modelOf],
  )

  /** The E-Way Bill PDF again - with its number and date once generated, and / or stamped CANCELLED. */
  const makeEwayBillPdf = useCallback(
    (record, { ewaybillNo = '', ewaybillDate = '', cancelled = false } = {}) =>
      enqueue(async () => {
        const { form, model } = await modelOf(record)
        const { createEwayBillPdf } = await import('@/Modules/SalesInvoice/Document/invoicePdf')
        return createEwayBillPdf(toEwayBillModel(model, { documentType: form.documentType, ewaybillNo, ewaybillDate, enteredDate: new Date(), cancelled }))
      }),
    [enqueue, modelOf],
  )

  const host = job ? <HistoryPdfJob key={job.id} job={job} /> : null

  return { status, host, makeInvoicePdf, makeEwayBillPdf }
}
