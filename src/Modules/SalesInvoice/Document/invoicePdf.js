/**
 * THE INVOICE PDF - a vector document, drawn from what the preview shows.
 *
 *   const bytes = await createInvoicePdf({ model, layout })   // Uint8Array, a real PDF
 *   downloadPdf(bytes, 'Invoice-INV-34.pdf')                   // the same bytes, to disk
 *   uploaded as the `file` of invoice/save-document-pdf/       // the same bytes, to the server
 *
 * ------------------------------------------------------------------
 * WHY VECTOR
 * ------------------------------------------------------------------
 * The PDF is written with @react-pdf/renderer (InvoicePdfDocument.jsx): its
 * text is real text in the PDF's built-in Helvetica faces and its rules are
 * real lines, so letters, figures, borders and QR codes stay sharp at any
 * zoom and the file is tens of kilobytes. A picture of the page (a canvas
 * capture) can only ever be as sharp as its pixels - zoom in and it softens,
 * and every page costs megabytes - so the sheets are not photographed.
 *
 * ------------------------------------------------------------------
 * ONE LAYOUT
 * ------------------------------------------------------------------
 * `layout` is the preview's own (useInvoiceLayout): the same split into A4
 * sheets, and the heights measured on screen, which the document is pinned
 * to. So the PDF has the preview's pages, rows and closing stack, sheet for
 * sheet. A layout measured for an older model is refused rather than used.
 *
 * The renderer is loaded on demand (Utils/pdf), so it is not in the page until
 * a PDF is first made.
 */

import { createPdf } from '@/Utils/pdf'

// Everything that imports them from here keeps working; they live in Utils/pdf.
export { downloadPdf, pdfBlob } from '@/Utils/pdf'

/** react-pdf embeds PNG and JPEG; anything else (WebP, GIF, SVG...) is redrawn as PNG first. */
const EMBEDDABLE = /^data:image\/(png|jpe?g);/i

/** An image the PDF can embed - the same picture as PNG when it is another format; null when it cannot be read. */
const embeddable = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null)
    if (EMBEDDABLE.test(src)) return resolve(src)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth || 300
        canvas.height = image.naturalHeight || 300
        canvas.getContext('2d').drawImage(image, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })

/** The model with its three images in a form the PDF can embed. */
async function withEmbeddableImages(model) {
  const [logo, signature, paymentQr, irnQr] = await Promise.all([
    embeddable(model.seller.logo),
    embeddable(model.seller.signature),
    embeddable(model.invoice.paymentQr),
    embeddable(model.einvoice?.qr),
  ])
  // An e-invoice without its QR is not printed: the IRN QR is what makes it valid.
  if (model.einvoice?.qr && !irnQr) throw new Error('The IRN QR code image could not be loaded.')
  ;[
    [model.seller.logo, logo, 'logo'],
    [model.seller.signature, signature, 'signature'],
    [model.invoice.paymentQr, paymentQr, 'payment QR'],
  ].forEach(([before, after, what]) => {
    if (before && !after) console.warn(`[Invoice PDF] The ${what} image could not be read and is left out of the PDF.`)
  })
  return {
    ...model,
    seller: { ...model.seller, logo, signature },
    invoice: { ...model.invoice, paymentQr },
    ...(model.einvoice ? { einvoice: { ...model.einvoice, qr: irnQr } } : null),
  }
}

/**
 * The PDF of the invoice, as bytes. `model` is the invoice model
 * (invoiceModel.js) and `layout` the preview's layout for it; for a challan,
 * `copies` are the CHALLAN_COPIES values to print (all three when not given). Throws with a
 * message fit to show when it cannot be made.
 */
export async function createInvoicePdf({ model, layout, copies }) {
  if (!layout || layout.model !== model || !layout.pages?.length) {
    throw new Error('The invoice preview is not ready yet.')
  }

  // A challan has its own document - every copy chosen (`copies`) under its own heading.
  const loadDocument = model.challan
    ? () => import('@/Modules/SalesInvoice/Document/ChallanPdfDocument')
    : () => import('@/Modules/SalesInvoice/Document/InvoicePdfDocument')

  return createPdf(loadDocument, {
    model: await withEmbeddableImages(model),
    pages: layout.pages,
    rowsByKey: Object.fromEntries(model.rows.map((row) => [row.key, row])),
    rowPx: layout.rowPx,
    metrics: layout.metrics,
    ...(model.challan ? { copies } : null),
  })
}

/**
 * The E-Way Bill PDF, as bytes - one A4 page drawn from toEwayBillModel(...)
 * (ewayBillModel.js); it needs no measured layout. Uploaded as the
 * `e_way_bill_pdf` of invoice/save-document-pdf/.
 */
export const createEwayBillPdf = (ewayBill) =>
  createPdf(() => import('@/Modules/SalesInvoice/Document/EwayBillPdfDocument'), { model: ewayBill })
