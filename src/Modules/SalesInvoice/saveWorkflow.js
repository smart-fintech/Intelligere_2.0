/**
 * SAVING A DOCUMENT, STEP BY STEP - the order and the failure rules, with no
 * screen attached (the workspace runs it and words the outcome):
 *
 *   1. create the document           POST invoice/business-documents/
 *   2. read its document_id          from the reply - never assumed
 *   3. make the PDF                  from the preview's sheets
 *   4. upload that PDF               POST invoice/save-document-pdf/ { id, file }
 *
 *   const result = await runSaveWorkflow({ saved, invoiceNo, createDocument, makePdf, uploadPdf, onStage })
 *
 *   saved           { documentId, invoiceNo, pdfBytes? } from an earlier attempt
 *                   that got past step 2 - or null. With it, step 1 is NEVER run
 *                   again, so a retry cannot create a second document; with
 *                   `pdfBytes` (the upload failed) the same PDF is sent again
 *                   rather than made again.
 *   createDocument()          -> the create reply
 *   makePdf()                 -> the PDF bytes - or the file the user chose; null
 *                             (no file chosen) skips step 4: the upload is never called
 *   uploadPdf(id, bytes)      -> the upload reply
 *   onStage(stage)            'creating' | 'pdf' | 'uploading', as each starts
 *
 * -> { outcome, saved?, error?, uploaded? } - `outcome` is one of SAVE_OUTCOME, and
 *    `saved` is what to keep for a retry (the document exists from step 2 on).
 */

import { documentIdOf } from '@/Services/salesInvoiceService'

export const SAVE_OUTCOME = Object.freeze({
  DONE: 'done',
  CREATE_FAILED: 'create-failed',
  NO_DOCUMENT_ID: 'no-document-id',
  PDF_FAILED: 'pdf-failed',
  UPLOAD_FAILED: 'upload-failed',
})

export async function runSaveWorkflow({ saved, invoiceNo, createDocument, makePdf, uploadPdf, onStage = () => {} }) {
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

  const document = { documentId, invoiceNo: saved?.invoiceNo ?? invoiceNo }

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
  try {
    await uploadPdf(documentId, pdfBytes)
  } catch (error) {
    return { outcome: SAVE_OUTCOME.UPLOAD_FAILED, saved: { ...document, pdfBytes }, error }
  }

  return { outcome: SAVE_OUTCOME.DONE, saved: document, uploaded: true }
}
