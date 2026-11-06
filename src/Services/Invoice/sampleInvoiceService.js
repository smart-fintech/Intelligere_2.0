/**
 * The invoice formats a company can print with - the Invoice Format field of
 * Inventory Details' Master Details, and the documents of Sales Invoice.
 */

import { api } from '@/Services/Global/apiService'

const SAMPLE_INVOICE_URL = 'invoice/SampleInvoice/'

/**
 *   GET  invoice/SampleInvoice/
 *
 *   { "images": [url, ...], "pdfs": [...], "format_notes": [...], "msg": "" }
 *
 * Only `images` is used: each image IS an invoice format. `pdfs` and
 * `format_notes` are not shown anywhere, so they are not kept.
 *
 * The list is the same for every company and every user, so it is fetched
 * ONCE per visit to the app and the answer kept here: opening the form again,
 * switching company or entering edit mode costs no second request. A failed
 * request is not kept, so Retry really asks again.
 */
let sampleInvoicesRequest = null

export const getSampleInvoices = () => {
  if (!sampleInvoicesRequest) {
    sampleInvoicesRequest = api
      .get(SAMPLE_INVOICE_URL)
      .then((response) => ({ images: Array.isArray(response?.images) ? response.images : [] }))
      .catch((failure) => {
        sampleInvoicesRequest = null
        throw failure
      })
  }

  return sampleInvoicesRequest
}

/**
 * The invoice formats the user picks from, as `{ value, src }`.
 *
 * `pdf_format` is the image's position in `images` plus one - images[0] is
 * format "1". The number is taken BEFORE an unusable entry is dropped, so a
 * blank in the list never shifts the formats after it. Values are strings,
 * the way the record holds them, so a saved value and a picked one compare
 * equal; the form sends the number.
 */
export const toInvoiceFormats = (samples) =>
  (samples?.images ?? [])
    .map((src, index) => ({ value: String(index + 1), src }))
    .filter(({ src }) => typeof src === 'string' && src.trim())
