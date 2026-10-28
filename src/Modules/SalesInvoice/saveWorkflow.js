/**
 * SAVING A DOCUMENT, STEP BY STEP - the order and the failure rules, with no
 * screen attached (the workspace runs it and words the outcome):
 *
 *   1. create the document           POST invoice/business-documents/
 *   2. read its document_id          from the reply - never assumed
 *   2b. book its stock (`book`)      a new Sales Order with Inventory Management only -
 *                                    never before step 2, and once: a booking done
 *                                    (or skipped) is kept in `saved.booked`
 *   3. make the PDF                  from the preview's sheets
 *   4. upload that PDF               POST invoice/save-document-pdf/ { id, file }
 *
 *   const result = await runSaveWorkflow({ saved, invoiceNo, createDocument, book, makePdf, uploadPdf, onStage })
 *
 *   saved           { documentId, invoiceNo, pdfBytes? } from an earlier attempt
 *                   that got past step 2 - or null. With it, step 1 is NEVER run
 *                   again, so a retry cannot create a second document; with
 *                   `pdfBytes` (the upload failed) the same PDF is sent again
 *                   rather than made again.
 *   createDocument()          -> the create reply
 *   book(documentId)          optional -> 'booked' | 'skipped' to go on to the PDF; anything
 *                             else ('paused' - the booking closed) stops here, the document
 *                             kept (BOOKING_PAUSED; saved.booked false) for a later try
 *   makePdf()                 -> the PDF bytes (with E-Way Bill: { invoice, ewayBill }, both
 *                             made before anything is sent) - or the file the user chose; null
 *                             (no file chosen) skips step 4: the upload is never called
 *   uploadPdf(id, bytes)      -> the upload reply
 *   onStage(stage)            'creating' | 'booking' | 'pdf' | 'uploading', as each starts
 *
 * -> { outcome, saved?, error?, uploaded?, reply? } - `outcome` is one of SAVE_OUTCOME,
 *    `saved` is what to keep for a retry (the document exists from step 2 on), and
 *    `reply` the upload's answer (a Sales Order's carries its `stock`).
 */

import { documentIdOf } from '@/Services/salesInvoiceService'

export const SAVE_OUTCOME = Object.freeze({
  DONE: 'done',
  CREATE_FAILED: 'create-failed',
  NO_DOCUMENT_ID: 'no-document-id',
  BOOKING_PAUSED: 'booking-paused',
  PDF_FAILED: 'pdf-failed',
  UPLOAD_FAILED: 'upload-failed',
})

export async function runSaveWorkflow({ saved, invoiceNo, createDocument, book = null, makePdf, uploadPdf, onStage = () => {} }) {
  let documentId = saved?.documentId ?? null

  // 1 + 2 - only when the document does not exist yet.
  if (documentId === null) {
    onStage('creating')
    let reply
    try {
      reply = await createDocument()
    } catch (error) {
      return { outcome: SAVE_OUTCOME.CREATE_FAILED, error }
    }
    documentId = documentIdOf(reply)
    if (documentId === null) return { outcome: SAVE_OUTCOME.NO_DOCUMENT_ID }
  }

  let document = { documentId, invoiceNo: saved?.invoiceNo ?? invoiceNo }

  // 2b - the stock booked, once; closed without it, the document waits for it.
  if (saved?.booked) document = { ...document, booked: true }
  else if (book) {
    onStage('booking')
    const answer = await book(documentId)
    if (answer !== 'booked' && answer !== 'skipped') return { outcome: SAVE_OUTCOME.BOOKING_PAUSED, saved: { ...document, booked: false } }
    document = { ...document, booked: true }
  }

  // 3 - unless an earlier attempt already made it and only its upload failed.
  let pdfBytes = saved?.pdfBytes ?? null
  if (!pdfBytes) {
    onStage('pdf')
    try {
      pdfBytes = await makePdf()
    } catch (error) {
      return { outcome: SAVE_OUTCOME.PDF_FAILED, saved: document, error }
    }
  }

  // Nothing to upload (a document whose own file was not chosen) - done, with no upload at all.
  if (!pdfBytes) return { outcome: SAVE_OUTCOME.DONE, saved: document, uploaded: false }

  // 4 - the very bytes just made.
  onStage('uploading')
  let reply
  try {
    reply = await uploadPdf(documentId, pdfBytes)
  } catch (error) {
    return { outcome: SAVE_OUTCOME.UPLOAD_FAILED, saved: { ...document, pdfBytes }, error }
  }

  return { outcome: SAVE_OUTCOME.DONE, saved: document, uploaded: true, reply }
}
